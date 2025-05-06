// server.js (create this in your project root)
const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Add CORS headers
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

// Serve static files
app.use(express.static(__dirname));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server using the HTTP server
const wss = new WebSocket.Server({ server });

// Add time control constants
const DEFAULT_TIME_SECONDS = 3 * 60; // 3 minutes
const INCREMENT_SECONDS = 1; // 1 second increment

// Helper functions for deck and card management

function createDeck(color) {
	const deck = [];

	// Standard MetaChess deck distribution
	// You can adjust these numbers based on your game balance
	const distribution = {
		'p': 35, // pawns
		'n': 9,  // knights
		'b': 8,  // bishops
		'r': 8,  // rooks
		'q': 5,  // queens
		'k': 6   // kings
	};

	for (const [piece, count] of Object.entries(distribution)) {
		// Add uppercase for black, lowercase for white
		const pieceChar = color === 'white' ? piece : piece.toUpperCase();
		for (let i = 0; i < count; i++) {
			deck.push(pieceChar);
		}
	}

	// Shuffle the deck
	return shuffleDeck([...deck]);
}

function shuffleDeck(deck) {
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

function drawCards(deck, count = 1) {
	const drawn = [];
	for (let i = 0; i < count && deck.length > 0; i++) {
		drawn.push(deck.pop());
	}
	return drawn;
}

// Modify your game object structure to include time control
function createNewGame(gameId, playerColor) {
	return {
		gameId: gameId,
		players: {
			white: playerColor === 'white' ? true : false,
			black: playerColor === 'black' ? true : false
		},
		// Add time control properties
		timeControl: {
			white: DEFAULT_TIME_SECONDS,
			black: DEFAULT_TIME_SECONDS,
			lastMoveTime: Date.now() // Track when the last move was made
		},
		currentTurn: 'white',
		// Other existing properties...
	};
}

// Games storage
const games = {};

// Broadcast helper function
function broadcastToGame(gameId, message) {
	const game = games[gameId];
	if (!game) return;

	game.players.forEach(client => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(message));
		}
	});
}

// In your move handler function
function handleMove(socket, data) {
	const game = games[data.gameId];
	if (!game) return;

	// Calculate time elapsed and update clock
	const currentTime = Date.now();
	const elapsedSeconds = (currentTime - game.timeControl.lastMoveTime) / 1000;

	// Update current player's time
	const currentPlayer = game.currentTurn;
	game.timeControl[currentPlayer] -= elapsedSeconds;

	// Check for time out
	if (game.timeControl[currentPlayer] <= 0) {
		// Player lost on time
		game.timeControl[currentPlayer] = 0; // Don't go negative

		// Notify both players of time out
		broadcastToGame(game.gameId, {
			type: 'time_out',
			player: currentPlayer,
			winner: currentPlayer === 'white' ? 'black' : 'white'
		});

		return; // Stop processing the move
	}

	// Add increment after move is made
	game.timeControl[currentPlayer] += INCREMENT_SECONDS;

	// Update last move timestamp
	game.timeControl.lastMoveTime = currentTime;

	// Switch turns
	game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';

	// Rest of your move handling code...

	// Include time information in move broadcasts
	broadcastToGame(game.gameId, {
		type: 'move_made',
		// Other existing data...
		timeControl: game.timeControl
	});
}

// In your pass turn handler
function handlePass(socket, data) {
	const game = games[data.gameId];
	if (!game) return;

	// Calculate time elapsed and update clock
	const currentTime = Date.now();
	const elapsedSeconds = (currentTime - game.timeControl.lastMoveTime) / 1000;

	// Update current player's time
	const currentPlayer = game.currentTurn;
	game.timeControl[currentPlayer] -= elapsedSeconds;

	// Check for time out
	if (game.timeControl[currentPlayer] <= 0) {
		// Player lost on time
		game.timeControl[currentPlayer] = 0;

		broadcastToGame(game.gameId, {
			type: 'time_out',
			player: currentPlayer,
			winner: currentPlayer === 'white' ? 'black' : 'white'
		});

		return;
	}

	// Add increment after pass
	game.timeControl[currentPlayer] += INCREMENT_SECONDS;

	// Update last move timestamp
	game.timeControl.lastMoveTime = currentTime;

	// Switch turns
	game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';

	// Include time information in pass broadcasts
	// rest of your pass handling code...
}

// WebSocket connection handling
wss.on('connection', (socket) => {
	console.log('Client connected');

	socket.on('message', (message) => {
		try {
			// Add logging before parsing
			console.log('Raw message received:', message.toString());

			const data = JSON.parse(message);
			console.log('Parsed message:', data);

			switch (data.type) {
				case 'create_game':
					const gameId = uuidv4();

					// Randomly assign color - 50% chance of white/black
					const creatorIsWhite = Math.random() < 0.5;
					const creatorColor = creatorIsWhite ? 'white' : 'black';
					const joinerColor = creatorIsWhite ? 'black' : 'white';

					// Create both decks
					const whiteDeck = createDeck('white');
					const blackDeck = createDeck('black');

					// Draw initial hands
					const whiteHand = drawCards(whiteDeck, 5);
					const blackHand = drawCards(blackDeck, 5);

					games[gameId] = {
						id: gameId,
						players: [socket],
						currentTurn: 'white', // Game always starts with white
						moves: [],
						whiteDeck: whiteDeck,
						whiteHand: whiteHand,
						blackDeck: blackDeck,
						blackHand: blackHand,
						creatorColor: creatorColor,
						joinerColor: joinerColor,
						timeControl: {
							white: DEFAULT_TIME_SECONDS,
							black: DEFAULT_TIME_SECONDS,
							lastMoveTime: Date.now()
						}
					};

					socket.gameId = gameId;
					socket.playerColor = creatorColor;

					socket.send(JSON.stringify({
						type: 'game_created',
						gameId: gameId,
						playerColor: creatorColor,
						whiteDeck: whiteDeck.length,
						whiteHand: creatorColor === 'white' ? whiteHand : [],
						blackDeck: blackDeck.length,
						blackHand: creatorColor === 'black' ? blackHand : []
					}));
					break;

				case 'join_game':
					const game = games[data.gameId];
					if (!game) {
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Game not found'
						}));
						return;
					}

					if (game.players.length >= 2) {
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Game is full'
						}));
						return;
					}

					game.players.push(socket);
					socket.gameId = data.gameId;
					socket.playerColor = game.joinerColor;

					socket.send(JSON.stringify({
						type: 'game_joined',
						gameId: data.gameId,
						playerColor: game.joinerColor,
						whiteDeck: game.whiteDeck.length,
						whiteHand: game.joinerColor === 'white' ? game.whiteHand : [],
						blackDeck: game.blackDeck.length,
						blackHand: game.joinerColor === 'black' ? game.blackHand : [],
						currentTurn: game.currentTurn
					}));

					// Notify first player that opponent has joined
					game.players[0].send(JSON.stringify({
						type: 'opponent_joined',
						gameId: data.gameId,
						opponentColor: game.joinerColor,
						creatorColor: game.creatorColor,  // Add this line
						currentTurn: game.currentTurn
					}));
					break;

				case 'move':
					handleMove(socket, data);
					break;

				case 'pass':
					const gamePass = games[data.gameId];
					if (!gamePass) return;

					console.log(`Player ${data.player} is passing their turn in game ${data.gameId}`);

					// Get the player who is passing
					const passingPlayer = data.player;

					// Verify it's actually this player's turn
					if (gamePass.currentTurn !== passingPlayer) {
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Not your turn to pass'
						}));
						return;
					}

					// Clear the passing player's hand (discard all cards)
					if (passingPlayer === 'white') {
						console.log(`White player passing - clearing hand with ${gamePass.whiteHand.length} cards`);
						gamePass.whiteHand = [];
						// Draw new cards for the player who passed
						if (gamePass.whiteDeck.length > 0) {
							console.log(`White deck before drawing: ${gamePass.whiteDeck.length} cards`);
							const drawnCards = drawCards(gamePass.whiteDeck, 5);
							console.log(`White player drew ${drawnCards.length} cards:`, drawnCards);
							gamePass.whiteHand = drawnCards;
							console.log(`White deck after drawing: ${gamePass.whiteDeck.length} cards`);
						} else {
							console.log(`White deck is empty, no cards drawn`);
						}
					} else {
						console.log(`Black player passing - clearing hand with ${gamePass.blackHand.length} cards`);
						gamePass.blackHand = [];
						// Draw new cards for the player who passed
						if (gamePass.blackDeck.length > 0) {
							console.log(`Black deck before drawing: ${gamePass.blackDeck.length} cards`);
							const drawnCards = drawCards(gamePass.blackDeck, 5);
							console.log(`Black player drew ${drawnCards.length} cards:`, drawnCards);
							gamePass.blackHand = drawnCards;
							console.log(`Black deck after drawing: ${gamePass.blackDeck.length} cards`);
						} else {
							console.log(`Black deck is empty, no cards drawn`);
						}
					}

					// Switch turn
					gamePass.currentTurn = passingPlayer === 'white' ? 'black' : 'white';

					// Notify both players about the pass
					gamePass.players.forEach(client => {
						if (client.readyState === WebSocket.OPEN) {
							// Determine which cards to send based on player color
							const playerColor = client.playerColor;

							client.send(JSON.stringify({
								type: 'pass_update',
								passingPlayer: passingPlayer,
								whiteDeck: gamePass.whiteDeck.length,
								whiteHand: playerColor === 'white' ? gamePass.whiteHand : [], // Only send white hand to white player
								blackDeck: gamePass.blackDeck.length,
								blackHand: playerColor === 'black' ? gamePass.blackHand : [], // Only send black hand to black player
								currentTurn: gamePass.currentTurn
							}));
						}
					});
					break;

				case 'heartbeat':
					// Just acknowledge heartbeat
					socket.send(JSON.stringify({
						type: 'heartbeat_ack'
					}));

					// If this is a game heartbeat, log active games
					if (data.gameId && games[data.gameId]) {
						const game = games[data.gameId];
						console.log(`Heartbeat for game ${data.gameId}, ${game.players.length} players connected`);
					}
					break;
			}
		} catch (error) {
			console.error('Error processing message:', error);
			socket.send(JSON.stringify({
				type: 'error',
				message: 'Invalid message format'
			}));
		}
	});

	socket.on('close', () => {
		console.log('Client disconnected');

		// Notify other player if this player was in a game
		if (socket.gameId && games[socket.gameId]) {
			const game = games[socket.gameId];

			game.players.forEach(client => {
				if (client !== socket && client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify({
						type: 'opponent_disconnected'
					}));
				}
			});

			// Remove game after some time
			setTimeout(() => {
				delete games[socket.gameId];
				console.log(`Game ${socket.gameId} removed due to player disconnect`);
			}, 60000);
		}
	});
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});