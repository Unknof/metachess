// server.js (create this in your project root)
const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Chess } = require('./lib/chess.js');

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
// Add near the top of your file, after other constants
const TIME_UPDATE_INTERVAL = 1000; // Send updates every second
const activeTimers = new Set();

setInterval(() => {
	const now = Date.now();
	for (const [gameId, game] of Object.entries(games)) {
		if (!game.timeControl.started && now - game.createdAt > 3 * 60 * 1000) {
			// Not started after 3 minutes
			delete games[gameId];
			console.log(`Deleted unstarted game ${gameId} after 3 minutes`);
		} else if (game.timeControl.started && now - game.lastActivity > 10 * 60 * 1000) {
			// Started but inactive for 10 minutes
			delete games[gameId];
			console.log(`Deleted inactive game ${gameId} after 10 minutes`);
		}
	}
}, 60 * 1000); // Run every minute

// Add a function to start/manage the game timers
function startGameTimer(gameId) {
	if (activeTimers.has(gameId)) return; // Timer already running

	activeTimers.add(gameId);
	console.log(`Starting server-side timer for game ${gameId}`);

	const gameTimerId = setInterval(() => {
		const game = games[gameId];
		if (!game || game.players.length < 2) {
			clearInterval(gameTimerId);
			activeTimers.delete(gameId);
			return;
		}

		// If game is ongoing and clock has started
		if (!game.gameOver && game.timeControl.started) {
			const now = Date.now();
			const elapsed = (now - game.timeControl.lastMoveTime) / 1000;
			game.timeControl.lastMoveTime = now;

			// Deduct time from current player
			game.timeControl[game.currentTurn] -= elapsed;

			// Check for timeout
			if (game.timeControl[game.currentTurn] <= 0) {
				game.timeControl[game.currentTurn] = 0;
				const winner = game.currentTurn === 'white' ? 'black' : 'white';

				// Notify both players
				game.players.forEach(client => {
					if (client.readyState === WebSocket.OPEN) {
						client.send(JSON.stringify({
							type: 'time_out',
							player: game.currentTurn,
							winner: winner
						}));
					}
				});

				// Stop the timer
				clearInterval(gameTimerId);
				activeTimers.delete(gameId);
				game.gameOver = true;
				delete games[gameId];
				return;
			}

			// Send time update to both clients
			game.players.forEach(client => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify({
						type: 'time_update',
						white: game.timeControl.white,
						black: game.timeControl.black,
						currentTurn: game.currentTurn
					}));
				}
			});
		}
	}, TIME_UPDATE_INTERVAL);
}

function createDeck(color) {
	const deck = [];

	// Standard MetaChess deck distribution
	// You can adjust these numbers based on your game balance
	const distribution = {
		'p': 45,
		'n': 18,
		'b': 18,
		'r': 9,
		'q': 8,
		'k': 6
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
						},
						createdAt: Date.now(),
						lastActivity: Date.now(),
						playerInfo: {
							[creatorColor]: { playerId: data.playerId || null }, // store playerId if available
							[joinerColor]: { playerId: null }
						},
						fen: 'start', // Initial FEN string
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

					game.lastActivity = Date.now();
					game.playerInfo[game.joinerColor].playerId = data.playerId;
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
					gameMove.lastActivity = Date.now();
					const moveData = data.move;
					const playerColor = data.player;
					const handIndex = moveData.handIndex;

					const currentTime = Date.now();
					if (!gameMove.timeControl.started && playerColor === 'white') {
						gameMove.timeControl.started = true;
						gameMove.timeControl.lastMoveTime = currentTime;
						startGameTimer(data.gameId);
					}


					// Add increment
					gameMove.timeControl[playerColor] += INCREMENT_SECONDS;

					// Update last move timestamp
					gameMove.timeControl.lastMoveTime = currentTime;


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

					if (data.fen) {
						gameMove.fen = data.fen;
					}

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
					gamePass.lastActivity = Date.now();
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
						startGameTimer(data.gameId);
					}
					// Process time for ongoing game


					// Add increment
					gamePass.timeControl[passingPlayer] += INCREMENT_SECONDS;

					// Update last move timestamp
					gamePass.timeControl.lastMoveTime = passTime;


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
					if (data.fen) {
						gamePass.fen = data.fen;
					}
					break;


				case 'check_valid_moves':
					console.log("RECEIVED check_valid_moves", data);
					const gameCheck = games[data.gameId];
					if (!gameCheck) {
						console.log("EXIT: Game not found", data.gameId);
						return;
					}

					const checkingPlayer = data.player;
					const currentFen = data.fen; // Client needs to send the current board state

					// Verify it's actually this player's turn
					if (gameCheck.currentTurn !== checkingPlayer) {
						console.log("EXIT: Not player's turn", checkingPlayer, gameCheck.currentTurn);
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Not your turn to check moves'
						}));
						return;
					}

					// Function to check if player has any valid moves
					const checkPlayerMoves = (player, game, fen) => {
						// Get the player's hand
						const hand = player === 'white' ? game.whiteHand : game.blackHand;

						// No cards in hand means no valid moves
						if (hand.length === 0) return false;

						// Create a chess instance with the current board state
						const chess = new Chess(fen);

						// Define piece type mapping
						const pieceTypeMap = {
							'p': 'pawn',
							'n': 'knight',
							'b': 'bishop',
							'r': 'rook',
							'q': 'queen',
							'k': 'king'
						};

						// Try each card to see if it has valid moves
						for (const card of hand) {
							const pieceType = card;
							const enginePieceType = pieceTypeMap[pieceType.toLowerCase()];

							if (!enginePieceType) continue;

							// Check if this piece has valid moves
							if (hasValidMovesForPiece(chess, enginePieceType)) {
								return true;
							}
						}

						// No valid moves found for any card
						return false;
					};

					// Helper function to check if a piece type has any valid moves
					function hasValidMovesForPiece(chess, pieceType) {
						// Find the single-character representation for this piece type
						let pieceChar;

						// If it's already a single character (like 'n'), use it
						if (pieceType.length === 1) {
							pieceChar = pieceType.toLowerCase();
						} else {
							// Otherwise, reverse-lookup in the pieceTypeMap
							const pieceTypeMap = {
								'p': 'pawn',
								'n': 'knight',
								'b': 'bishop',
								'r': 'rook',
								'q': 'queen',
								'k': 'king'
							};

							for (const [char, name] of Object.entries(pieceTypeMap)) {
								if (name === pieceType.toLowerCase()) {
									pieceChar = char;
									break;
								}
							}
						}

						// If no valid mapping found, log error and return false
						if (!pieceChar) {
							console.error("Invalid piece type:", pieceType);
							return false;
						}

						// Check all moves and filter for the specific piece type
						const moves = chess.moves({ verbose: true });
						const validMoves = [];

						for (const move of moves) {
							const piece = chess.get(move.from);
							if (piece && piece.type === pieceChar) {
								validMoves.push(move);
							}
						}

						return validMoves.length > 0;
					}

					// Check if player has valid moves
					const hasValidMoves = checkPlayerMoves(checkingPlayer, gameCheck, currentFen);

					// If player has valid moves, just let them know
					if (hasValidMoves) {
						socket.send(JSON.stringify({
							type: 'valid_moves_check',
							hasValidMoves: true
						}));
						return;
					}

					// Handle case where player has no valid moves
					// Get the player's hand and deck
					const hand = checkingPlayer === 'white' ? gameCheck.whiteHand : gameCheck.blackHand;
					const deck = checkingPlayer === 'white' ? gameCheck.whiteDeck : gameCheck.blackDeck;

					// If deck is empty, player loses
					if (deck.length === 0) {
						// Notify both players
						gameCheck.players.forEach(client => {
							if (client.readyState === WebSocket.OPEN) {
								client.send(JSON.stringify({
									type: 'game_over',
									loser: checkingPlayer,
									reason: 'no_valid_moves'
								}));
							}
						});
						delete games[gameId];
						return;
					}

					// Clear hand
					if (checkingPlayer === 'white') {
						gameCheck.whiteHand = [];
					} else {
						gameCheck.blackHand = [];
					}
					console.log("drawing new cards");
					// Draw new cards
					if (checkingPlayer === 'white') {
						gameCheck.whiteHand = drawCards(gameCheck.whiteDeck, Math.min(5, gameCheck.whiteDeck.length));
					} else {
						gameCheck.blackHand = drawCards(gameCheck.blackDeck, Math.min(5, gameCheck.blackDeck.length));
					}

					// Notify both players about the redraw
					gameCheck.players.forEach(client => {
						if (client.readyState === WebSocket.OPEN) {
							const playerColor = client.playerColor;

							client.send(JSON.stringify({
								type: 'redraw_update',
								redrawingPlayer: checkingPlayer,
								whiteDeck: gameCheck.whiteDeck.length,
								whiteHand: playerColor === 'white' ? gameCheck.whiteHand : [],
								blackDeck: gameCheck.blackDeck.length,
								blackHand: playerColor === 'black' ? gameCheck.blackHand : [],
								needToCheckAgain: true // Tell client to check again after receiving new hand
							}));
						}
					});
					break;

				case 'reconnect':
					const gameToReconnect = games[data.gameId];
					if (!gameToReconnect || gameToReconnect.gameOver) {
						console.log(`Reconnect failed: game ${data.gameId} not found or over`);
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Game no longer exists or is already over'
						}));
						return;
					}

					// Check if this is a valid player in the game
					let reconnectingPlayerColor = null;
					for (const color of ['white', 'black']) {
						if (gameToReconnect.playerInfo[color].playerId === data.playerId) {
							reconnectingPlayerColor = color;
							break;
						}
					}
					if (!reconnectingPlayerColor) {
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Player ID not recognized for this game'
						}));
						return;
					}

					let playerFound = false;
					for (let i = 0; i < gameToReconnect.players.length; i++) {
						// If there's a slot for this color that's disconnected or the same player is reconnecting

						if ((gameToReconnect.players[i].playerColor === reconnectingPlayerColor &&
							gameToReconnect.players[i].readyState !== WebSocket.OPEN) ||
							gameToReconnect.players.length < 2) {

							// Replace or add the socket
							socket.gameId = data.gameId;
							socket.playerColor = reconnectingPlayerColor;

							if (i < gameToReconnect.players.length) {
								gameToReconnect.players[i] = socket;
							} else {
								gameToReconnect.players.push(socket);
							}

							playerFound = true;
							console.log(`Player ${reconnectingPlayerColor} reconnected to game ${data.gameId}`);
							break;
						}
					}

					if (!playerFound) {
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Cannot reconnect to game - position already filled'
						}));
						return;
					}

					let chess = new Chess();
					for (const move of gameToReconnect.moves) {
						chess.move(move);
					}
					const fen = chess.fen();

					// Send the current game state to the reconnected player
					socket.send(JSON.stringify({
						type: 'reconnection_successful',
						gameId: data.gameId,
						playerColor: reconnectingPlayerColor,
						currentTurn: gameToReconnect.currentTurn,
						fen, // <-- Use reconstructed FEN
						whiteDeck: gameToReconnect.whiteDeck.length,
						whiteHand: reconnectingPlayerColor === 'white' ? gameToReconnect.whiteHand : [],
						blackDeck: gameToReconnect.blackDeck.length,
						blackHand: reconnectingPlayerColor === 'black' ? gameToReconnect.blackHand : [],
						timeControl: gameToReconnect.timeControl
					}));

					if (gameToReconnect.removeTimeout) {
						clearTimeout(gameToReconnect.removeTimeout);
						gameToReconnect.removeTimeout = null;
					}


					// Notify the other player that their opponent has reconnected
					gameToReconnect.players.forEach(player => {
						if (player !== socket && player.readyState === WebSocket.OPEN) {
							player.send(JSON.stringify({
								type: 'opponent_reconnected'
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

				case 'check_game': {
					const game = games[data.gameId];
					socket.send(JSON.stringify({
						type: 'check_game_result',
						gameId: data.gameId,
						exists: !!game,
						started: !!(game && game.timeControl && game.timeControl.started)
					}));
					break;
				}
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

		if (socket.gameId && games[socket.gameId]) {
			const game = games[socket.gameId];

			game.players.forEach(client => {
				if (client !== socket && client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify({
						type: 'opponent_disconnected'
					}));
				}
			});

			// Remove game after some time, and store the timeout ID
			game.removeTimeout = setTimeout(() => {
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
	console.log('Games in memory at server start:', Object.keys(games));
});