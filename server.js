// server.js (create this in your project root)
const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const DEFAULT_TIME_SECONDS = 180; // 3 minutes
const INCREMENT_SECONDS = 2;      // 2 second increment
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

// Helper functions for deck and card management

function createDeck(color) {
	const deck = [];

	// Standard MetaChess deck distribution
	// You can adjust these numbers based on your game balance
	const distribution = {
		'p': 30, // pawns
		'n': 9,  // knights
		'b': 8,  // bishops
		'r': 8,  // rooks
		'q': 6,  // queens
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

// Games storage
const games = {};

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
							lastMoveTime: null, // null until first white move
							started: false      // Flag to track if clock has started
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
					const gameMove = games[data.gameId];
					if (!gameMove) return;

					// Update hands based on the move
					const moveData = data.move;
					const playerColor = data.player;
					const handIndex = moveData.handIndex;

					const currentTime = Date.now();
					if (!gameMove.timeControl.started && playerColor === 'white') {
						gameMove.timeControl.started = true;
						gameMove.timeControl.lastMoveTime = currentTime;
					}
					// Process time for ongoing game
					else if (gameMove.timeControl.started) {
						const elapsedSeconds = (currentTime - gameMove.timeControl.lastMoveTime) / 1000;

						// Deduct time from current player's clock
						gameMove.timeControl[playerColor] -= elapsedSeconds;

						// Check for timeout
						if (gameMove.timeControl[playerColor] <= 0) {
							gameMove.timeControl[playerColor] = 0;

							// Determine winner
							const winner = playerColor === 'white' ? 'black' : 'white';

							// Notify both players of timeout
							gameMove.players.forEach(client => {
								if (client.readyState === WebSocket.OPEN) {
									client.send(JSON.stringify({
										type: 'time_out',
										player: playerColor,
										winner: winner
									}));
								}
							});

							return; // Stop processing move
						}

						// Add increment
						gameMove.timeControl[playerColor] += INCREMENT_SECONDS;

						// Update last move timestamp
						gameMove.timeControl.lastMoveTime = currentTime;
					}

					if (playerColor === 'white') {
						// Remove the card from hand
						gameMove.whiteHand.splice(handIndex, 1);

						// Draw a new card if deck isn't empty
						if (gameMove.whiteDeck.length > 0 && gameMove.whiteHand.length < 5) {
							gameMove.whiteHand.push(drawCards(gameMove.whiteDeck, 1)[0]);
						}
					} else {
						// Remove the card from hand
						gameMove.blackHand.splice(handIndex, 1);

						// Draw a new card if deck isn't empty
						if (gameMove.blackDeck.length > 0 && gameMove.blackHand.length < 5) {
							gameMove.blackHand.push(drawCards(gameMove.blackDeck, 1)[0]);
						}
					}

					// Store move
					gameMove.moves.push(data.move);
					gameMove.currentTurn = data.player === 'white' ? 'black' : 'white';

					// Broadcast move to the other player
					gameMove.players.forEach(client => {
						if (client !== socket && client.readyState === WebSocket.OPEN) {
							// Determine which cards to send based on player color
							const playerColor = client.playerColor;

							client.send(JSON.stringify({
								type: 'opponent_move',
								move: data.move,
								whiteDeck: gameMove.whiteDeck.length,
								whiteHand: playerColor === 'white' ? gameMove.whiteHand : [], // Only send white hand to white player
								blackDeck: gameMove.blackDeck.length,
								blackHand: playerColor === 'black' ? gameMove.blackHand : [], // Only send black hand to black player
								timeControl: {
									white: gameMove.timeControl.white,
									black: gameMove.timeControl.black
								},
								currentTurn: gameMove.currentTurn
							}));
						}
					});

					// Send updated hand to the current player
					socket.send(JSON.stringify({
						type: 'hand_update',
						whiteDeck: gameMove.whiteDeck.length,
						whiteHand: gameMove.whiteHand,
						blackDeck: gameMove.blackDeck.length,
						blackHand: gameMove.blackHand,
						timeControl: {
							white: gameMove.timeControl.white,
							black: gameMove.timeControl.black
						},
						currentTurn: gameMove.currentTurn
					}));
					break;

				case 'pass':
					const gamePass = games[data.gameId];
					if (!gamePass) return;

					const passingPlayer = data.player;

					// Check if passing player has an empty deck
					const emptyDeck = passingPlayer === 'white' ?
						(gamePass.whiteDeck.length === 0) : (gamePass.blackDeck.length === 0);

					if (emptyDeck) {
						// Player can't pass with empty deck
						socket.send(JSON.stringify({
							type: 'cannot_pass',
							message: 'You cannot pass with an empty deck. You must play a card or check for loss.'
						}));
						return;
					}

					console.log(`Player ${data.player} is passing their turn in game ${data.gameId}`);

					// Get the player who is passing
					// Verify it's actually this player's turn
					if (gamePass.currentTurn !== passingPlayer) {
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Not your turn to pass'
						}));
						return;
					}

					// Time control handling
					const passTime = Date.now();

					// Start clock on white's first pass if not already started
					if (!gamePass.timeControl.started && passingPlayer === 'white') {
						gamePass.timeControl.started = true;
						gamePass.timeControl.lastMoveTime = passTime;
					}
					// Process time for ongoing game
					else if (gamePass.timeControl.started) {
						const elapsedSeconds = (passTime - gamePass.timeControl.lastMoveTime) / 1000;

						// Deduct time from current player's clock
						gamePass.timeControl[passingPlayer] -= elapsedSeconds;

						// Check for timeout
						if (gamePass.timeControl[passingPlayer] <= 0) {
							gamePass.timeControl[passingPlayer] = 0;

							// Determine winner
							const winner = passingPlayer === 'white' ? 'black' : 'white';

							// Notify both players of timeout
							gamePass.players.forEach(client => {
								if (client.readyState === WebSocket.OPEN) {
									client.send(JSON.stringify({
										type: 'time_out',
										player: passingPlayer,
										winner: winner
									}));
								}
							});

							return; // Stop processing move
						}

						// Add increment
						gamePass.timeControl[passingPlayer] += INCREMENT_SECONDS;

						// Update last move timestamp
						gamePass.timeControl.lastMoveTime = passTime;
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
								timeControl: {
									white: gamePass.timeControl.white,
									black: gamePass.timeControl.black
								},
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