// server.js (create this in your project root)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Create express app
const app = express();

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

// Games storage
const games = {};

// WebSocket connection handling
wss.on('connection', (socket) => {
	console.log('Client connected');

	socket.on('message', (message) => {
		const data = JSON.parse(message);
		console.log('Received:', data);

		switch (data.type) {
			case 'create_game':
				const gameId = uuidv4();

				// Create both decks
				const whiteDeck = createDeck('white');
				const blackDeck = createDeck('black');

				// Draw initial hands
				const whiteHand = drawCards(whiteDeck, 5);
				const blackHand = drawCards(blackDeck, 5);

				games[gameId] = {
					id: gameId,
					players: [socket],
					currentTurn: 'white',
					moves: [],
					whiteDeck: whiteDeck,
					whiteHand: whiteHand,
					blackDeck: blackDeck,
					blackHand: blackHand
				};

				socket.gameId = gameId;
				socket.playerColor = 'white';

				socket.send(JSON.stringify({
					type: 'game_created',
					gameId: gameId,
					playerColor: 'white',
					whiteDeck: whiteDeck.length,
					whiteHand: whiteHand,
					blackDeck: blackDeck.length,
					blackHand: blackHand
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
				socket.playerColor = 'black';

				socket.send(JSON.stringify({
					type: 'game_joined',
					gameId: data.gameId,
					playerColor: 'black',
					whiteDeck: game.whiteDeck.length,
					whiteHand: game.whiteHand,
					blackDeck: game.blackDeck.length,
					blackHand: game.blackHand,
					currentTurn: game.currentTurn
				}));

				// Notify first player that opponent has joined
				game.players[0].send(JSON.stringify({
					type: 'opponent_joined',
					gameId: data.gameId,
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
						client.send(JSON.stringify({
							type: 'opponent_move',
							move: data.move,
							whiteDeck: gameMove.whiteDeck.length,
							whiteHand: gameMove.whiteHand,
							blackDeck: gameMove.blackDeck.length,
							blackHand: gameMove.blackHand,
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
					currentTurn: gameMove.currentTurn
				}));
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