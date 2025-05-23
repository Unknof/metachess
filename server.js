// server.js (create this in your project root)
require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Chess } = require('chess.js');
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;
if (!uri) {
	console.error('MONGODB_URI is not set! Please set it in your environment or .env file.');
	process.exit(1);
}
const client = new MongoClient(uri);

const DEFAULT_TIME_SECONDS = 180; // 3 minutes
const INCREMENT_SECONDS = 2;      // 2 second increment
// Add CORS headers
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});
app.use(express.json());

app.post('/api/register', async (req, res) => {
	try {
		const { username, email, password, playerId } = req.body;
		if (!username || !email || !password || !playerId) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		const db = client.db('metachess');
		const users = db.collection('users');

		// Check for existing user
		const existing = await users.findOne({ $or: [{ email }, { username }, { playerId }] });
		if (existing) {
			return res.status(409).json({ error: 'User already exists' });
		}

		// Hash password (use bcrypt)
		const bcrypt = require('bcrypt');
		const hashedPassword = await bcrypt.hash(password, 10);

		const user = { username, email, password: hashedPassword, playerId };
		await users.insertOne(user);

		res.status(201).json({ message: 'User registered successfully' });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});
app.post('/api/login', async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) {
			return res.status(400).json({ error: 'Email and password are required' });
		}

		const db = client.db('metachess');
		const users = db.collection('users');

		// Find user by email
		const user = await users.findOne({ email });
		if (!user) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		// Check password
		const bcrypt = require('bcrypt');
		const isValidPassword = await bcrypt.compare(password, user.password);
		if (!isValidPassword) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		// Return user info (without password)
		res.status(200).json({
			message: 'Login successful',
			user: {
				id: user._id,
				username: user.username,
				email: user.email,
				playerId: user.playerId
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});
app.post('/api/save_deck', async (req, res) => {
	try {
		const { playerId, deck } = req.body;
		if (!playerId || !Array.isArray(deck)) {
			return res.status(400).json({ error: 'Missing playerId or deck' });
		}

		const db = client.db('metachess');
		const users = db.collection('users');
		const result = await users.updateOne(
			{ playerId },
			{ $set: { deck } }
		);

		if (result.matchedCount === 0) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.status(200).json({ message: 'Deck saved successfully' });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});
app.get('/api/get_deck', async (req, res) => {
	try {
		const playerId = req.query.playerId;
		if (!playerId) {
			return res.status(400).json({ error: 'Missing playerId' });
		}

		const db = client.db('metachess');
		const users = db.collection('users');
		const user = await users.findOne({ playerId });

		if (!user || !Array.isArray(user.deck) || user.deck.length === 0) {
			return res.status(404).json({ error: 'No deck found' });
		}

		res.status(200).json({ deck: user.deck });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
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
		if (
			(!game.timeControl || !game.timeControl.started) &&
			now - game.createdAt > 3 * 60 * 1000
		) {
			// Not started after 3 minutes
			delete games[gameId];
			console.log(`Deleted unstarted game ${gameId} after 3 minutes`);
		} else if (
			game.timeControl &&
			game.timeControl.started &&
			now - game.lastActivity > 120 * 60 * 1000
		) {
			// Started but inactive for 120 minutes
			delete games[gameId];
			console.log(`Deleted inactive game ${gameId} after 120 minutes`);
		}
	}
}, 60 * 1000); // Run every minute

async function getUserDeck(playerId, color = 'white') {
	const db = client.db('metachess');
	const users = db.collection('users');
	const user = await users.findOne({ playerId });
	if (user && Array.isArray(user.deck) && user.deck.length > 0) {
		// Adjust case for color
		const deck = user.deck.map(piece =>
			color === 'white' ? piece.toLowerCase() : piece.toUpperCase()
		);
		// Shuffle the deck before returning
		return shuffleDeck([...deck]);
	}
	return null;
}


async function createGame({ whiteSocket, blackSocket, creatorColor, joinerColor, creatorPlayerId = null, joinerPlayerId = null }) {
	const gameId = uuidv4();

	// Create both decks
	const whiteDeck = (await getUserDeck(creatorPlayerId, 'white')) || createDeck('white');
	const blackDeck = (await getUserDeck(joinerPlayerId, 'black')) || createDeck('black');

	// Draw initial hands
	const whiteHand = drawCards(whiteDeck, 5);
	const blackHand = drawCards(blackDeck, 5);

	const game = {
		id: gameId,
		players: [whiteSocket, blackSocket].filter(Boolean),
		currentTurn: 'white',
		moves: [],
		whiteDeck,
		whiteHand,
		blackDeck,
		blackHand,
		creatorColor,
		joinerColor,
		timeControl: {
			white: DEFAULT_TIME_SECONDS,
			black: DEFAULT_TIME_SECONDS,
			lastMoveTime: null,
			started: false
		},
		createdAt: Date.now(),
		lastActivity: Date.now(),
		playerInfo: {
			[creatorColor]: { playerId: creatorPlayerId },
			[joinerColor]: { playerId: joinerPlayerId }
		},
		fen: 'start',
		rematchOffers: { white: false, black: false }
		// Remove waitingSocket here!
	};

	games[gameId] = game;

	// Assign socket properties if sockets are provided
	if (whiteSocket) {
		whiteSocket.gameId = gameId;
		whiteSocket.playerColor = 'white';
	}
	if (blackSocket) {
		blackSocket.gameId = gameId;
		blackSocket.playerColor = 'black';
	}

	return { game, gameId, whiteDeck, blackDeck, whiteHand, blackHand };
}
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
				handleGameOver(game, 'timeout', game.currentTurn, winner);
				return;
			}

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

function getDeckComposition(deck) {
	const composition = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
	for (const card of deck) {
		const lower = card.toLowerCase();
		if (composition.hasOwnProperty(lower)) {
			composition[lower]++;
		}
	}
	return composition;
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

function handleGameOver(game, reason, winner) {

	game.gameOver = true;
	activeTimers.delete(game.id);

	// Notify both players
	game.players.forEach(client => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify({
				type: 'game_over',
				reason,
				winner
			}));
		}
	});
	if (game.removeTimeout) clearTimeout(game.removeTimeout);
	game.removeTimeout = setTimeout(() => {
		delete games[game.id];
		console.log(`Game ${game.id} deleted 3 minutes after game over`);
	}, 3 * 60 * 1000);

}

// Games storage
const games = {};

// WebSocket connection handling
wss.on('connection', (socket) => {
	console.log('Client connected');

	socket.on('message', async (message) => {
		try {
			// Add logging before parsing
			console.log('Raw message received:', message.toString());

			const data = JSON.parse(message);
			console.log('Parsed message:', data);

			switch (data.type) {
				case 'request_new_game': {
					const gameId = uuidv4();
					games[gameId] = {
						id: gameId,
						players: [],
						createdAt: Date.now(),
						lastActivity: Date.now(),
						playerInfo: {},
						waitingSocket: socket // Remember the creator's socket
						// No decks/hands yet!
					};
					socket.send(JSON.stringify({
						type: 'new_game_id',
						gameId
					}));
					break;
				}

				case 'join_game': {
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

					// Assign color by join order
					let playerColor;
					let isRematch = false;

					// Check if this game has pre-assigned player colors (rematch case)
					if (game.playerInfo.white?.playerId === data.playerId) {
						playerColor = 'white';
						isRematch = true;
						console.log(`Rematch: Player ${data.playerId} assigned to white`);
					} else if (game.playerInfo.black?.playerId === data.playerId) {
						playerColor = 'black';
						isRematch = true;
						console.log(`Rematch: Player ${data.playerId} assigned to black`);
					} else {
						// Normal game: assign color by join order
						if (game.players.length === 0) {
							playerColor = Math.random() < 0.5 ? 'white' : 'black';
						} else {
							playerColor = game.players[0].playerColor === 'white' ? 'black' : 'white';
						}
						console.log(`New game: Player ${data.playerId} assigned to ${playerColor}`);
					}

					socket.gameId = data.gameId;
					socket.playerColor = playerColor;
					game.players.push(socket);
					game.playerInfo[playerColor] = { playerId: data.playerId || null };

					if (game.players.length === 1 && game.waitingSocket && game.waitingSocket.readyState === WebSocket.OPEN) {
						console.log(`Notifying waiting socket of opponent joining`);
						game.waitingSocket.send(JSON.stringify({
							type: 'opponent_joined',
							gameId: data.gameId
						}));
						// Optionally, clear waitingSocket so it's not used again
						delete game.waitingSocket;
					}

					// When both players have joined, initialize the game using createGame
					if (game.players.length === 2) {

						const whiteSocket = game.players.find(s => s.playerColor === 'white');
						const blackSocket = game.players.find(s => s.playerColor === 'black');
						const creatorColor = 'white';
						const joinerColor = 'black';
						const creatorPlayerId = game.playerInfo['white']?.playerId || null;
						const joinerPlayerId = game.playerInfo['black']?.playerId || null;

						const { game: fullGame } = await createGame({
							whiteSocket,
							blackSocket,
							creatorColor,
							joinerColor,
							creatorPlayerId,
							joinerPlayerId
						});
						// Overwrite the minimal game slot with the full game object
						games[data.gameId] = fullGame;

						// Notify both players
						fullGame.players.forEach(client => {
							client.send(JSON.stringify({
								type: 'game_joined',
								gameId: fullGame.id,
								playerColor: client.playerColor,
								whiteDeck: fullGame.whiteDeck.length,
								whiteHand: client.playerColor === 'white' ? fullGame.whiteHand : [],
								blackDeck: fullGame.blackDeck.length,
								blackHand: client.playerColor === 'black' ? fullGame.blackHand : [],
								deckComposition: client.playerColor === 'white'
									? getDeckComposition(fullGame.whiteDeck)
									: getDeckComposition(fullGame.blackDeck),
								currentTurn: fullGame.currentTurn,

							}));
						});
					} else {
						// Only one player, send waiting message
						socket.send(JSON.stringify({
							type: 'waiting_for_opponent',
							gameId: data.gameId,
							playerColor
						}));
					}
					break;
				}

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

					let fen = gameMove.fen === 'start'
						? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
						: gameMove.fen;

					let moveChess = new Chess();
					moveChess.load(fen);
					console.log("FEN before move:", fen);
					moveChess.move({ from: data.move.from, to: data.move.to, promotion: data.move.promotion });
					console.log("FEN after move:", moveChess.fen());


					gameMove.fen = moveChess.fen();
					//console.log("Server Updated FEN after move:", gameMove.fen);

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
								blackHand: playerColor === 'black' ? gameMove.blackHand : [],
								fen: gameMove.fen,
								timeControl: {
									white: gameMove.timeControl.white,
									black: gameMove.timeControl.black
								},
								currentTurn: gameMove.currentTurn
							}));
						}
					});

					if (moveChess.isCheckmate()) {
						handleGameOver(gameMove, 'checkmate', gameMove.currentTurn);
						return;
					}

					const targetBeforeMove = moveChess.get(data.move.to);
					const isOpponentKing =
						targetBeforeMove &&
						targetBeforeMove.type === 'k' &&
						targetBeforeMove.color !== data.player[0]; // 'w' or 'b'


					if (isOpponentKing) {
						handleGameOver(gameMove, 'king_capture', data.player);
						return;
					}


					// Send updated hand to the current player
					socket.send(JSON.stringify({
						type: 'hand_update',
						whiteDeck: gameMove.whiteDeck.length,
						whiteHand: data.player === 'white' ? gameMove.whiteHand : [],
						blackDeck: gameMove.blackDeck.length,
						blackHand: data.player === 'black' ? gameMove.blackHand : [],
						deckComposition: data.player === 'white'
							? getDeckComposition(gameMove.whiteDeck)
							: getDeckComposition(gameMove.blackDeck),
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

					let fenParts = gamePass.fen.split(' ');
					fenParts[1] = gamePass.currentTurn === 'white' ? 'w' : 'b';
					fenParts[3] = '-'; // Clear en passant
					gamePass.fen = fenParts.join(' ');
					console.log("Updated FEN after pass:", gamePass.fen);

					// Notify both players about the pass
					gamePass.players.forEach(client => {
						if (client.readyState === WebSocket.OPEN) {
							// Determine which cards to send based on player color
							const playerColor = client.playerColor;

							client.send(JSON.stringify({
								type: 'pass_update',
								passingPlayer: passingPlayer,
								whiteDeck: gamePass.whiteDeck.length,
								deckComposition: data.player === 'white'
									? getDeckComposition(gamePass.whiteDeck)
									: getDeckComposition(gamePass.blackDeck),
								whiteHand: playerColor === 'white' ? gamePass.whiteHand : [], // Only send white hand to white player
								blackDeck: gamePass.blackDeck.length,
								blackHand: playerColor === 'black' ? gamePass.blackHand : [], // Only send black hand to black player
								timeControl: {
									white: gamePass.timeControl.white,
									black: gamePass.timeControl.black
								},
								currentTurn: gamePass.currentTurn,
								fen: gamePass.fen // Send the updated FEN
							}));
						}
					});
					break;


				case 'check_valid_moves': {
					const gameCheck = games[data.gameId];

					if (!gameCheck) {
						console.log(`[check_valid_moves] EXIT: Game not found: ${data.gameId}`);
						return;
					}

					const checkingPlayer = data.player;
					const currentFen = gameCheck.fen; // We take server board state

					// Verify it's actually this player's turn
					if (gameCheck.currentTurn !== checkingPlayer) {
						console.log(`[check_valid_moves] EXIT: Not player's turn. Player: ${checkingPlayer}, CurrentTurn: ${gameCheck.currentTurn}`);
						socket.send(JSON.stringify({
							type: 'error',
							message: 'Not your turn to check moves'
						}));
						return;
					}

					// Get hand and deck
					const hand = checkingPlayer === 'white' ? gameCheck.whiteHand : gameCheck.blackHand;
					const deck = checkingPlayer === 'white' ? gameCheck.whiteDeck : gameCheck.blackDeck;
					console.log(`[check_valid_moves] Player hand:`, hand, `Deck size:`, deck.length);

					// Helper: check if a piece type has any valid moves
					function hasValidMovesForPiece(chess, pieceType) {
						let pieceChar;
						const pieceTypeMap = {
							'p': 'pawn', 'n': 'knight', 'b': 'bishop', 'r': 'rook', 'q': 'queen', 'k': 'king'
						};
						if (pieceType.length === 1) {
							pieceChar = pieceType.toLowerCase();
						} else {
							for (const [char, name] of Object.entries(pieceTypeMap)) {
								if (name === pieceType.toLowerCase()) {
									pieceChar = char;
									break;
								}
							}
						}
						if (!pieceChar) {
							console.error(`[check_valid_moves] Invalid piece type:`, pieceType);
							return false;
						}
						const moves = chess.moves({ verbose: true });
						const validMoves = moves.filter(move => {
							const piece = chess.get(move.from);
							return piece && piece.type === pieceChar;
						});
						console.log(`[check_valid_moves] Valid moves for "${pieceType}" (${pieceChar}):`, validMoves);
						return validMoves.length > 0;
					}

					// Server-side validation of valid moves
					let hasValidMoves = false;
					if (hand.length === 0) {
						console.log(`[check_valid_moves] Hand is empty, no valid moves.`);
					} else {
						const checkchess = new Chess(currentFen);
						for (const card of hand) {
							const pieceTypeMap = {
								'p': 'pawn', 'n': 'knight', 'b': 'bishop', 'r': 'rook', 'q': 'queen', 'k': 'king'
							};
							const enginePieceType = pieceTypeMap[card.toLowerCase()];
							console.log(`[check_valid_moves] Checking card: ${card}, mapped to: ${enginePieceType}`);
							if (!enginePieceType) continue;
							if (hasValidMovesForPiece(checkchess, enginePieceType)) {
								hasValidMoves = true;
								break;
							}
						}
					}

					if (hasValidMoves) {
						console.log(`[check_valid_moves] Player ${checkingPlayer} HAS valid moves. Sending valid_moves_check:true`);
						socket.send(JSON.stringify({
							type: 'valid_moves_check',
							hasValidMoves: true
						}));
						return;
					}

					// No valid moves: check deck
					console.log(`[check_valid_moves] Player ${checkingPlayer} has NO valid moves.`);
					if (deck.length === 0) {
						console.log(`[check_valid_moves] Deck is empty. Player loses.`);
						gameCheck.players.forEach(client => {
							if (client.readyState === WebSocket.OPEN) {
								client.send(JSON.stringify({
									type: 'game_over',
									loser: checkingPlayer,
									reason: 'no_valid_moves'
								}));
							}
						});
						delete games[data.gameId];
						return;
					}

					// Redraw: clear hand, draw new cards
					if (checkingPlayer === 'white') {
						gameCheck.whiteHand = [];
						gameCheck.whiteHand = drawCards(gameCheck.whiteDeck, Math.min(5, gameCheck.whiteDeck.length));
						console.log(`[check_valid_moves] Drew new white hand:`, gameCheck.whiteHand);
					} else {
						gameCheck.blackHand = [];
						gameCheck.blackHand = drawCards(gameCheck.blackDeck, Math.min(5, gameCheck.blackDeck.length));
						console.log(`[check_valid_moves] Drew new black hand:`, gameCheck.blackHand);
					}

					// Notify both players about the redraw
					gameCheck.players.forEach(client => {
						if (client.playerColor === checkingPlayer && client.readyState === WebSocket.OPEN) {
							console.log(`[check_valid_moves] Sending redraw_update to ${checkingPlayer}`);
							client.send(JSON.stringify({
								type: 'redraw_update',
								redrawingPlayer: checkingPlayer,
								whiteDeck: gameCheck.whiteDeck.length,
								deckComposition: data.player === 'white'
									? getDeckComposition(gameCheck.whiteDeck)
									: getDeckComposition(gameCheck.blackDeck),
								whiteHand: checkingPlayer === 'white' ? gameCheck.whiteHand : [],
								blackDeck: gameCheck.blackDeck.length,
								blackHand: checkingPlayer === 'black' ? gameCheck.blackHand : [],
								needToCheckAgain: true
							}));
						}
					});
					break;
				}
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
					console.log('server fen after reconnect: ', gameToReconnect.fen);

					let reconnectPayload;
					if (reconnectingPlayerColor === 'white') {
						reconnectPayload = {
							type: 'reconnection_successful',
							gameId: data.gameId,
							playerColor: 'white',
							currentTurn: gameToReconnect.currentTurn,
							fen: gameToReconnect.fen,
							deckComposition: data.player === 'white'
								? getDeckComposition(gameToReconnect.whiteDeck)
								: getDeckComposition(gameToReconnect.blackDeck),
							whiteDeck: gameToReconnect.whiteDeck.length,
							whiteHand: gameToReconnect.whiteHand,
							blackDeck: gameToReconnect.blackDeck.length,
							blackHand: [],
							timeControl: gameToReconnect.timeControl
						};
					} else {
						reconnectPayload = {
							type: 'reconnection_successful',
							gameId: data.gameId,
							playerColor: 'black',
							currentTurn: gameToReconnect.currentTurn,
							fen: gameToReconnect.fen,
							deckComposition: data.player === 'white'
								? getDeckComposition(gameToReconnect.whiteDeck)
								: getDeckComposition(gameToReconnect.blackDeck),
							whiteDeck: gameToReconnect.whiteDeck.length,
							whiteHand: [],
							blackDeck: gameToReconnect.blackDeck.length,
							blackHand: gameToReconnect.blackHand,
							timeControl: gameToReconnect.timeControl
						};
					}

					//console.log('Sending reconnection payload:', JSON.stringify(reconnectPayload, null, 2));
					socket.send(JSON.stringify(reconnectPayload));

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

				case 'resign':
					const gameResign = games[data.gameId];
					if (!gameResign) return;
					const winner = data.player === 'white' ? 'black' : 'white';
					handleGameOver(gameResign, 'resignation', winner);
					break;

				case 'rematch_offer': {
					const gameId = data.gameId;
					const player = data.player;
					const game = games[gameId];
					if (!game) {
						socket.send(JSON.stringify({
							type: 'rematch_failed',
							message: 'Game no longer exists or is too old for rematch.'
						}));
						break;
					}

					// Track rematch offers on the game object itself
					if (!game.rematchOffers) game.rematchOffers = { white: false, black: false };
					game.rematchOffers[player] = true;

					// Find opponent socket
					const opponentColor = player === 'white' ? 'black' : 'white';
					const opponentSocket = game.players.find(s => s.playerColor === opponentColor);

					// Notify opponent to highlight menu/rematch
					if (opponentSocket && opponentSocket.readyState === WebSocket.OPEN) {
						opponentSocket.send(JSON.stringify({
							type: 'rematch_offer_received'
						}));
					}

					// If both players have offered rematch, create new game
					if (game.rematchOffers.white && game.rematchOffers.black) {
						// Create a new empty game slot
						const newGameId = uuidv4();
						games[newGameId] = {
							id: newGameId,
							players: [],
							createdAt: Date.now(),
							lastActivity: Date.now(),
							playerInfo: {
								// Swap colors for rematch
								white: { playerId: game.playerInfo.black?.playerId || null },
								black: { playerId: game.playerInfo.white?.playerId || null }
							}
						};
						// Notify both players to join the new game
						console.log(`Both players accepted rematch. Creating new game ${newGameId}`);
						game.players.forEach(client => {
							if (client.readyState === WebSocket.OPEN) {
								client.send(JSON.stringify({
									type: 'rematch_start',
									newGameId: newGameId
								}));
							}
						});
					}
					break;
				}
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