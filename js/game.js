import { MetachessSocket } from './socket.js';
import * as Multiplayer from './game_modules/multiplayer.js';
import { setupSocketListeners } from './game_modules/socketListeners.js';

let board = null;
let chess = null;

export function setChessAndBoard(instances) {
	chess = instances.chess;
	board = instances.board;
}

export function getChess() { return chess; }
export function getBoard() { return board; }


const MetachessGame = (function () {
	// Game state
	let whiteDeck = [];
	let whiteHand = [];
	let blackDeck = [];
	let blackHand = [];
	let playerHand = null;
	let opponentHand = null;
	let currentTurn = 'white'; // white or black
	let gameOver = false;
	let board = null;
	let chess = null;

	let selectedCard = null;
	let engineInitialized = false;
	let playerColor = null; // 'white', 'black', or null (for local play)
	let timeControl = {
		white: 180,  // 3 minutes in seconds
		black: 180,
		started: false,
		timerId: null
	};

	const pieceTypeMap = {
		p: 'pawn',
		n: 'knight',
		b: 'bishop',
		r: 'rook',
		q: 'queen',
		k: 'king'
	};

	const soundEffects = {
		move: new Audio('sounds/move.mp3'),
		capture: new Audio('sounds/capture.mp3'),
		win: new Audio('sounds/win.mp3')
	};


	function multiplayerInit(chessInstance, boardInstance, serverState) {
		chess = chessInstance;
		board = boardInstance;

		console.log("Initializing multiplayer game...");

		// 1. Clear any move highlighting
		updateLastMoveHighlighting(null, null);

		// 2. Assign decks and hands from server state
		whiteDeck = Array.isArray(serverState.whiteDeck) ? serverState.whiteDeck : Array(serverState.whiteDeck).fill('?');
		blackDeck = Array.isArray(serverState.blackDeck) ? serverState.blackDeck : Array(serverState.blackDeck).fill('?');
		whiteHand = serverState.whiteHand || [];
		blackHand = serverState.blackHand || [];

		// 3. Initialize material display
		createMaterialDisplay();

		// 4. Update UI to show deck counts
		updateDecks();

		// 5. Initialize Stockfish engine
		engineInitialized = MetachessEngine.init();
		if (!engineInitialized) {
			updateStatusMessage("Warning: Stockfish engine not available");
		}

		// 6. Enable controls for the current player
		togglePlayerControls();

		// 7. Update hand UI to show the player's cards
		updateHands();

		// 8. Flip board if player is black
		if (playerColor === 'black' && board) {
			board.orientation('black');
		}
	}

	// Add button initialization to the init function
	function init(chessInstance, boardInstance) {
		chess = chessInstance;
		board = boardInstance;

		console.log("Initializing game...");

		// Clear any move highlighting
		updateLastMoveHighlighting(null, null);

		// Initialize decks with appropriate case
		whiteDeck = MetachessDeck.createDeck();
		blackDeck = MetachessDeck.createDeck().map(piece => piece.toUpperCase());

		createMaterialDisplay();

		console.log("Decks created:", whiteDeck.length, blackDeck.length);

		// Draw initial hands
		whiteHand = MetachessDeck.drawCards(whiteDeck, 5);
		blackHand = MetachessDeck.drawCards(blackDeck, 5);

		console.log("Initial hands:", whiteHand, blackHand);

		// Update UI
		updateDecks();

		// Initialize engine
		engineInitialized = MetachessEngine.init();
		if (!engineInitialized) {
			updateStatusMessage("Warning: Stockfish engine not available");
		}

		// Enable controls for current player
		togglePlayerControls();

		// Update hands (with active status)
		updateHands();

		// Start the clock
		//startClock();


		// Setup pass button handler for both colors
		document.getElementById('pass-turn').addEventListener('click', function () {
			// Check for empty deck condition first
			const emptyDeck = currentTurn === 'white' ?
				(whiteDeck.length === 0) : (blackDeck.length === 0);

			if (emptyDeck) {
				// Show checking message
				updateStatusMessage("Checking for valid moves...");

				// Check if any card has valid moves
				const hasValidMove = checkForValidMoves(currentTurn);
				if (!hasValidMove) {
					const winner = currentTurn === 'white' ? 'BLACK' : 'WHITE';
					gameOverWin(winner, "no Cards")
				} else {
					updateStatusMessage(`Cannot pass with empty deck. You must play a card.`);
				}

			} else {
				// Regular pass
				passTurn();
			}
		});

		// If player color is somehow set (like in a reconnection scenario),
		// make sure the board orientation matches
		if (playerColor === 'black' && board) {
			board.orientation('black');
		}
	}

	function updateDecks() {
		// Use the new IDs from your streamlined HTML
		if (document.getElementById('player-deck-count')) {
			if (playerColor) {
				// Multiplayer - show player's deck count
				document.getElementById('player-deck-count').textContent =
					playerColor === 'white' ? whiteDeck.length : blackDeck.length;
				document.getElementById('opponent-deck-count').textContent =
					playerColor === 'white' ? blackDeck.length : whiteDeck.length;
			} else {
				// Singleplayer - show current turn's deck count
				document.getElementById('player-deck-count').textContent =
					currentTurn === 'white' ? whiteDeck.length : blackDeck.length;
				document.getElementById('opponent-deck-count').textContent =
					currentTurn === 'white' ? blackDeck.length : whiteDeck.length;
			}
		}
	}

	// Update updateHands function for the new simplified UI
	function updateHands() {
		console.log("Updating hands, current turn:", currentTurn);

		// Remove existing listeners first
		const allCards = document.querySelectorAll('.piece-card');
		allCards.forEach(card => {
			card.replaceWith(card.cloneNode(true)); // Clone to remove event listeners
		});

		// Determine which player we are in multiplayer, or use current turn in single player
		let playerToRender, containerToUse;

		if (playerColor) {
			// In multiplayer - we only ever render our own cards
			playerToRender = playerColor;
			containerToUse = 'player-cards';

			// Update deck counts
			document.getElementById('player-deck-count').textContent =
				playerColor === 'white' ? whiteDeck.length : blackDeck.length;
			document.getElementById('opponent-deck-count').textContent =
				playerColor === 'white' ? blackDeck.length : whiteDeck.length;
		} else {
			// In single player - render current turn's cards
			playerToRender = currentTurn;
			containerToUse = 'player-cards';

			// Update deck counts
			document.getElementById('player-deck-count').textContent =
				currentTurn === 'white' ? whiteDeck.length : blackDeck.length;
			document.getElementById('opponent-deck-count').textContent =
				currentTurn === 'white' ? blackDeck.length : whiteDeck.length;
		}

		const currentHand = playerToRender === 'white' ? whiteHand : blackHand;
		const validMoves = checkCardValiditySynchronous(currentHand);

		// Render only current player's cards - NOW WITH validMoves parameter
		if (playerToRender === 'white') {
			MetachessDeck.renderCards(whiteHand, containerToUse, 'white', currentTurn === 'white', validMoves);
		} else {
			MetachessDeck.renderCards(blackHand, containerToUse, 'black', currentTurn === 'black', validMoves);
		}

		// Add click handlers to cards
		const playercards = document.querySelectorAll(`#${containerToUse} .piece-card`);
		playercards.forEach(card => {
			// Handle clicks for both desktop and mobile
			card.addEventListener('click', () => {
				if (card.classList.contains('disabled')) {
					const pieceType = card.dataset.pieceType;
					const pieceName = pieceTypeMap[pieceType.toLowerCase()] || pieceType;
					updateStatusMessage(`That ${pieceName} has no valid moves`);
					return;
				}
				console.log("Card clicked:", card.dataset.pieceType, card.dataset.index);
				selectCard(card.dataset.pieceType, parseInt(card.dataset.index));
			});

			// For mobile, add a simple touch handler to prevent delays
			if (window.innerWidth <= 768) {
				card.addEventListener('touchend', function (e) {
					// Prevent the subsequent click event to avoid double activation
					e.preventDefault();
					console.log("Card touched:", card.dataset.pieceType, card.dataset.index);
					selectCard(card.dataset.pieceType, parseInt(card.dataset.index));
				});
			}
		});

		// Clear selection
		selectedCard = null;
		clearCardSelection();
	}

	// Update togglePlayerControls to use the single pass button
	function togglePlayerControls() {
		console.log("Toggle controls for turn:", currentTurn);

		const passButton = document.getElementById('pass-turn');

		// Enable pass button only if it's current player's turn in multiplayer 
		// or always in singleplayer
		if (playerColor) {
			passButton.disabled = (currentTurn !== playerColor);
		} else {
			passButton.disabled = false;
		}
	}

	function selectCard(pieceType, index) {
		// If this is a multiplayer game, verify it's the player's turn
		if (playerColor && currentTurn !== playerColor) {
			updateStatusMessage("Not your turn");
			return;
		}

		console.log('Selected piece type:', pieceType, 'at index:', index, 'Current turn:', currentTurn);

		// 1-letter code: lowercase = white, uppercase = black
		const isWhitePiece = pieceType === pieceType.toLowerCase();
		const isBlackPiece = pieceType === pieceType.toUpperCase();

		if ((currentTurn === 'white' && isBlackPiece) ||
			(currentTurn === 'black' && isWhitePiece)) {
			console.error("Wrong player trying to move!");
			updateStatusMessage(`It's ${currentTurn}'s turn!`);
			return;
		}

		// Remember the selected card
		selectedCard = {
			type: pieceType,
			index: index
		};

		// Highlight selected card
		clearCardSelection();
		const cardElement = document.querySelector(`#${currentTurn}-cards .piece-card[data-index="${index}"]`);
		if (cardElement) {
			cardElement.classList.add('selected');
		}

		// Ask Stockfish for the best move with this piece type
		if (engineInitialized) {
			updateStatusMessage("Thinking...");

			const enginePieceType = pieceTypeMap[pieceType.toLowerCase()];
			if (!enginePieceType) {
				console.error("Invalid piece type:", pieceType);
				updateStatusMessage("Invalid piece type!");
				return;
			}

			MetachessEngine.getBestMoveForPieceType(chess.fen(), enginePieceType)
				.then(moveStr => {
					console.log("Engine returned move for", pieceType + ":", moveStr);

					// Convert UCI format (e.g. "c2c4") to chess.js format
					let move = null;
					// Declare these variables outside the if-block to make them available in the entire scope
					let from = null;
					let to = null;
					let promotion = undefined;
					let isKingCapture = false;
					let isCapture = false;

					if (moveStr && moveStr.length >= 4) {
						from = moveStr.substring(0, 2);
						to = moveStr.substring(2, 4);
						promotion = moveStr.length > 4 ? moveStr.substring(4, 5) : undefined;

						// NEW: Check if the target square has a king
						const targetSquare = chess.get(to);
						isKingCapture = targetSquare && targetSquare.type === 'k';

						isCapture = targetSquare !== null;

						// Try to make the move in chess.js format
						move = chess.move({
							from: from,
							to: to,
							promotion: promotion
						});

						console.log("Converted move:", { from, to, promotion });
					}

					if (move) {
						// Update board display
						board.position(chess.fen());
						highlightKingInCheck(); // Add this line
						updateMaterialDisplay();

						if (move) {
							playSound(isCapture ? 'capture' : 'move');
						}

						// Highlight the move that was just made - now using variables from the wider scope
						updateLastMoveHighlighting(move.from, move.to);

						if (currentTurn === 'white' && !timeControl.started) {
							startClock();
						}
						if (!playerColor) {  // Only in singleplayer mode
							const INCREMENT_SECONDS = 2; // 2 second increment (same as in passTurn)
							timeControl[currentTurn] += INCREMENT_SECONDS;
							updateClockDisplay();
						}

						// NEW: If a king was captured, declare the capturing player as winner
						if (isKingCapture) {
							const winner = currentTurn === 'white' ? 'WHITE' : 'BLACK';
							gameOverWin(winner, 'king_capture');
						}
						// Remove the card from hand
						removeCardFromHand(index);

						// Send move to server
						MetachessSocket.sendMove({
							from: move.from,
							to: move.to,
							promotion: move.promotion,
							pieceType: pieceType,
							handIndex: index
						});

						// Switch turn if game not over
						if (!gameOver) {
							switchTurn();
							updateBoardBorder();
						}
					} else {
						console.error("Move was not legal:", moveStr);
						updateStatusMessage(`No valid ${pieceType} move found`);

						// Don't remove the card since the move failed
					}
				})
				.catch(error => {
					console.error("Engine error:", error);
					updateStatusMessage(`No valid ${pieceType} moves available`);

					// Don't remove the card since there was an error
				});
		} else {
			updateStatusMessage("Stockfish not available. Choose another card");
		}
	}

	function removeCardFromHand(index) {
		// Remove card from current player's hand
		if (currentTurn === 'white') {
			whiteHand.splice(index, 1);

			// Draw a new card if deck isn't empty
			if (whiteDeck.length > 0 && whiteHand.length < 5) {
				whiteHand.push(MetachessDeck.drawCards(whiteDeck, 1)[0]);
			}
		} else {
			blackHand.splice(index, 1);

			// Draw a new card if deck isn't empty
			if (blackDeck.length > 0 && blackHand.length < 5) {
				blackHand.push(MetachessDeck.drawCards(blackDeck, 1)[0]);
			}
		}

		// Update UI
		updateDecks();
		updateHands();
	}

	function clearCardSelection() {
		// Clear all card selections
		document.querySelectorAll('.piece-card').forEach(card => {
			card.classList.remove('selected');
		});
	}

	function switchTurn() {
		// Toggle the current turn
		currentTurn = currentTurn === 'white' ? 'black' : 'white';
		console.log("Switched turn to:", currentTurn);

		// Get current board position
		const boardPosition = chess.fen().split(' ')[0]; // Just the piece positions
		const nextColor = currentTurn === 'white' ? 'w' : 'b'; // Chess.js uses 'w'/'b' for colors

		// Create new FEN with correct turn, castling rights, etc.
		const newFen = `${boardPosition} ${nextColor} KQkq - 0 1`; // Reset castling, en passant, and move counters

		// Completely reset the chess engine with the new position and turn
		chess = new Chess(newFen);

		// Update the board display
		if (board) {
			board.position(chess.fen());
			highlightKingInCheck(); // Add this line
		}
		if (checkForCheckmate()) {
			return; // Game is over, exit switchTurn
		}

		// If using Stockfish, reset it with the new position
		if (engineInitialized && window.engine) {
			window.engine.postMessage('position fen ' + chess.fen());
			window.engine.postMessage('ucinewgame'); // Reset the engine completely
		}

		// Update UI
		togglePlayerControls();
		updateHands();

		if (!checkForValidMoves(currentTurn)) {
			if (!playerColor) {
				// Single player mode - handle locally
				attemptRedrawsUntilValidMove(currentTurn);
				return;
			} else if (currentTurn === playerColor) {
				// Multiplayer mode - need to request redraw from server
				console.log("No valid moves for player:", currentTurn, " Requesting redraw");
				handleMultiplayerRedraw();
				return;
			}
		}


		// Update game status to show active game
		if (playerColor) {
			if (currentTurn === playerColor) {
				updateStatusMessage('Your turn');
			} else {
				updateStatusMessage('Opponent\'s turn');
			}
		} else {
			updateStatusMessage(`${currentTurn.toUpperCase()}'s turn`);
		}

		updateBoardBorder();
	}
	// Add helper function to check if a player has playable cards
	function hasPlayableCards(color) {
		if (color === 'white') {
			return whiteHand.length > 0 || whiteDeck.length > 0;
		} else {
			return blackHand.length > 0 || blackDeck.length > 0;
		}
	}
	function handleMultiplayerRedraw() {
		// Show status message
		updateStatusMessage("You have no valid moves. Requesting redraw...");

		// Disable controls while processing
		disableAllControls();

		console.log("Sending redraw request to server with data:", {
			player: playerColor,
			gameId: MetachessSocket.gameId,
			fen: chess.fen()
		});
		// Send redraw request to server with current board state
		MetachessSocket.sendCheckValidMoves({
			player: playerColor,
			gameId: MetachessSocket.gameId,
			fen: chess.fen() // Send the current board state
		});

		updateHands(); // Update hands to reflect the current state

		// The server will respond with redraw_update which will be handled by existing listeners
	}

	// Update the existing pass functions to use multiplayer when appropriate
	function passTurn() {
		if (gameOver) return;

		console.log("Passing turn for:", currentTurn);

		// Check if we're in multiplayer mode
		if (playerColor && MetachessSocket.getConnectionInfo().connected) {
			console.log("Multiplayer mode detected, using multiplayer pass logic");
			Multiplayer.handlePassInMultiplayer({
				playerColor,
				currentTurn,
				MetachessSocket,
				updateStatusMessage,
				disableAllControls
			});
			return;
		}

		// Singleplayer pass logic
		const passingPlayer = currentTurn;

		// Check if passing player has an empty deck
		const emptyDeck = passingPlayer === 'white' ? (whiteDeck.length === 0) : (blackDeck.length === 0);

		if (emptyDeck) {
			// Cannot pass with empty deck - check if any valid moves exist
			const hasValidMove = checkForValidMoves(passingPlayer);
			if (!hasValidMove) {
				gameOverWin(passingPlayer, 'no_cards');
			} else {
				updateStatusMessage(`Cannot pass with empty deck. You must play a card.`);
			}
			return;
		}


		// Start clock on first pass if not already started
		if (!timeControl.started) {
			timeControl.started = true;
			startClock();
		}
		// Add increment time (like in server)
		const INCREMENT_SECONDS = 2; // 2 second increment
		timeControl[passingPlayer] += INCREMENT_SECONDS;

		// Check for timeout
		if (timeControl[passingPlayer] <= 0) {
			timeControl[passingPlayer] = 0;
			gameOverWin(passingPlayer, 'time_out');
			return;
		}

		updateClockDisplay();

		// Regular pass logic continues here...
		// Clear the passing player's hand (discard all cards)
		if (passingPlayer === 'white') {
			console.log(`White player passing - clearing hand with ${whiteHand.length} cards`);
			whiteHand = [];

			// Draw new cards for the player who passed
			if (whiteDeck.length > 0) {
				console.log(`White deck before drawing: ${whiteDeck.length} cards`);
				const drawnCards = MetachessDeck.drawCards(whiteDeck, 5);
				console.log(`White player drew ${drawnCards.length} cards:`, drawnCards);
				whiteHand = drawnCards;
				console.log(`White deck after drawing: ${whiteDeck.length} cards`);
			} else {
				console.log(`White deck is empty, no cards drawn`);
			}
		} else {
			console.log(`Black player passing - clearing hand with ${blackHand.length} cards`);
			blackHand = [];

			// Draw new cards for the player who passed
			if (blackDeck.length > 0) {
				console.log(`Black deck before drawing: ${blackDeck.length} cards`);
				const drawnCards = MetachessDeck.drawCards(blackDeck, 5);
				console.log(`Black player drew ${drawnCards.length} cards:`, drawnCards);
				blackHand = drawnCards;
				console.log(`Black deck after drawing: ${blackDeck.length} cards`);
			} else {
				console.log(`Black deck is empty, no cards drawn`);
			}
		}

		// Update UI elements
		updateDecks();

		// Switch turn (updates current player and UI elements)
		switchTurn();

		// Status message
		updateStatusMessage(
			`${passingPlayer.toUpperCase()} passed the turn`
		);

		updateBoardBorder();
	}


	function setupSocketListenersWrapper() {
		// We need to create an object with all dependencies
		const deps = {
			// Network
			MetachessSocket,

			// Game state variables - these are passed by reference
			playerColor,
			whiteDeck,
			whiteHand,
			blackDeck,
			blackHand,
			timeControl,
			currentTurn,
			chess,
			board,

			// Functions needed
			applyOpponentMove,
			updateStatusMessage,
			disableAllControls,
			initializeWithColor,
			updateDecks,
			updateHands,
			synchronizeGameState,
			togglePlayerControls,
			updateClockDisplay,
			showPassIndicator,
			gameOverWin,
			updateBoardBorder,
			handleMultiplayerRedraw,
			checkForValidMoves,
			startClock,
			updateMaterialDisplay,
			highlightKingInCheck
		};

		// Call the external function and get any updated state
		const updatedState = setupSocketListeners(deps);

		// Update our local state if needed (handles assignment to primitive variables)
		if (updatedState) {
			// These updates are only needed for primitive variables that can't be modified directly
			if (updatedState.playerColor) playerColor = updatedState.playerColor;
			if (updatedState.currentTurn) currentTurn = updatedState.currentTurn;
		}
	}

	function initializeWithColor(color) {
		// Initialize game state for specific color
		currentTurn = 'white'; // Game always starts with white
		playerColor = color;

		// Flip the board if player is black
		if (board && color === 'black') {
			board.orientation('black');
		}
		updateClockOrientation();
		// Determine which hand is controlled by the player
		playerHand = playerColor === 'white' ? whiteHand : blackHand;
		opponentHand = playerColor === 'white' ? blackHand : whiteHand;

		// Update game status based on whose turn it is
		if (currentTurn === playerColor) {
			updateStatusMessage('Your turn');
		} else {
			updateStatusMessage('Opponent\'s turn');
		}

		// Update controls based on whose turn it is
		togglePlayerControls();

		// Update the hands to hide opponent cards
		updateHands();
	}

	function updateClockOrientation() {
		// Get timer containers
		const timerBar = document.querySelector('.timer-bar');
		const opponentInfo = document.querySelector('.opponent-info');
		const playerInfo = document.querySelector('.player-info');

		// Add visual labels for multiplayer
		if (playerColor) {
			// Get timer label elements (add these in HTML or create them here)
			const whiteLabel = document.querySelector('.white-timer .timer-label') ||
				createTimerLabel('.white-timer', 'white');
			const blackLabel = document.querySelector('.black-timer .timer-label') ||
				createTimerLabel('.black-timer', 'black');

			if (playerColor === 'black') {
				whiteLabel.textContent = 'Opponent';
				blackLabel.textContent = 'You';
			} else {
				whiteLabel.textContent = 'You';
				blackLabel.textContent = 'Opponent';
			}
		}

		console.log("Updating clock orientation for player color:", playerColor);
		updateClockDisplay();
	}

	// Helper function to create timer labels if they don't exist
	function createTimerLabel(timerSelector, colorName) {
		const timer = document.querySelector(timerSelector);
		if (!timer) return null;

		const label = document.createElement('div');
		label.className = 'timer-label';
		label.style.fontSize = '10px';
		label.style.opacity = '0.8';
		timer.appendChild(label);

		return label;
	}

	function applyOpponentMove(moveData) {
		// Extract move data
		const { from, to, promotion } = moveData;

		// NEW: Check if the target square has a king
		const targetSquare = chess.get(to);
		const isKingCapture = targetSquare && targetSquare.type === 'k';


		const isCapture = targetSquare !== null;

		// Make the move on the chess board
		const move = chess.move({
			from: from,
			to: to,
			promotion: promotion
		});

		if (move) {
			// Update board display
			board.position(chess.fen());
			highlightKingInCheck(); // Add this line
			updateMaterialDisplay()

			playSound(isCapture ? 'capture' : 'move');

			// Highlight last move
			updateLastMoveHighlighting(move.from, move.to);

			if (checkForCheckmate()) {
				return; // Game is over, exit function
			}

			// NEW: If a king was captured, declare the capturing player as winner
			if (isKingCapture) {
				const winner = currentTurn === 'white' ? 'WHITE' : 'BLACK';
				gameOverWin(winner, "king_capture");

				// Notify other player in multiplayer mode
				if (playerColor && MetachessSocket.isConnected()) {
					MetachessSocket.sendGameOver({
						gameId: MetachessSocket.gameId,
						winner: currentTurn,
						reason: `${winner} captured the king`
					});
				}
			}
		}
	}

	function disableAllControls() {
		// Use the single pass button instead of white-pass and black-pass
		const passButton = document.getElementById('pass-turn');
		if (passButton) {
			passButton.disabled = true;
		}
	}
	// Add this helper function
	function synchronizeGameState(serverTurn) {
		// Update our local turn state
		currentTurn = serverTurn;

		if (timeControl.started) {
			updateClockDisplay();
		}

		// Synchronize the chess engine's internal state
		const boardPosition = chess.fen().split(' ')[0];
		const engineColor = currentTurn === 'white' ? 'w' : 'b';
		const newFen = `${boardPosition} ${engineColor} KQkq - 0 1`;

		// Reset the chess engine with the new position and turn
		chess = new Chess(newFen);

		// Update the board display
		if (board) {
			board.position(chess.fen());
		}

		updateMaterialDisplay();

		// If using Stockfish, reset it with the new position
		if (engineInitialized && window.engine) {
			window.engine.postMessage('position fen ' + chess.fen());
			window.engine.postMessage('ucinewgame');
		}

		// Update UI
		togglePlayerControls();
		updateHands();
		updateClockOrientation();

		if (playerColor && currentTurn === playerColor && !checkForValidMoves(playerColor)) {
			console.log("No valid moves after synchronizeGameState, requesting redraw");
			handleMultiplayerRedraw();
			return;
		}
		// Update game status
		if (playerColor) {
			updateStatusMessage(
				currentTurn === playerColor ? 'Your turn' : 'Opponent\'s turn'
			);
		} else {
			updateStatusMessage(`${currentTurn.toUpperCase()}'s turn`);
		}
	}

	// Add this helper function
	function updateLastMoveHighlighting(from, to) {
		// Remove any existing highlights
		const squares = document.querySelectorAll('.square-55d63');
		squares.forEach(square => {
			square.classList.remove('highlight-square');
			square.classList.remove('highlight-source');
			square.classList.remove('highlight-target');
		});

		// Add highlighting to the new source and target squares
		if (from && to) {
			const fromSquare = document.querySelector(`.square-${from}`);
			const toSquare = document.querySelector(`.square-${to}`);

			if (fromSquare) {
				fromSquare.classList.add('highlight-square');
				fromSquare.classList.add('highlight-source');
			}

			if (toSquare) {
				toSquare.classList.add('highlight-square');
				toSquare.classList.add('highlight-target');
			}
		}
	}

	// Add this function to format time as mm:ss
	function formatTime(seconds) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}

	// Replace the updateClockDisplay function with this fixed version
	function updateClockDisplay() {
		if (playerColor === 'black') {
			// When playing as black, swap the timer displays visually
			// This keeps the DOM structure intact but displays opposite times
			document.getElementById('white-time').textContent = formatTime(timeControl.black);
			document.getElementById('black-time').textContent = formatTime(timeControl.white);

			// Highlight active player's clock (visually reversed for black's perspective)
			document.querySelector('.white-timer').classList.toggle('active', currentTurn === 'black');
			document.querySelector('.black-timer').classList.toggle('active', currentTurn === 'white');

			// Highlight low time warning (visually reversed)
			document.querySelector('.white-timer').classList.toggle('low-time', timeControl.black < 15);
			document.querySelector('.black-timer').classList.toggle('low-time', timeControl.white < 15);
		} else {
			// Standard behavior for white player
			document.getElementById('white-time').textContent = formatTime(timeControl.white);
			document.getElementById('black-time').textContent = formatTime(timeControl.black);

			// Standard highlighting
			document.querySelector('.white-timer').classList.toggle('active', currentTurn === 'white');
			document.querySelector('.black-timer').classList.toggle('active', currentTurn === 'black');

			// Standard low time warning
			document.querySelector('.white-timer').classList.toggle('low-time', timeControl.white < 15);
			document.querySelector('.black-timer').classList.toggle('low-time', timeControl.black < 15);
		}
	}

	// Add this function to start the visual countdown timer
	// Update your startClock function:
	function startClock() {
		// Set the started flag regardless of mode
		timeControl.started = true;

		// In multiplayer, we don't need a local timer - just mark it as started
		if (playerColor && MetachessSocket.isConnected()) {
			console.log("Multiplayer mode: using server time only");
			if (timeControl.timerId) {
				clearInterval(timeControl.timerId);
				timeControl.timerId = null;
			}
			return;
		}

		// In single-player mode, use local timer as before
		if (timeControl.timerId) clearInterval(timeControl.timerId);

		timeControl.timerId = setInterval(() => {
			// Existing timer code for single-player mode
			if (currentTurn === 'white') {
				timeControl.white = Math.max(0, timeControl.white - 0.1);
			} else {
				timeControl.black = Math.max(0, timeControl.black - 0.1);
			}
			updateClockDisplay();

			// Existing timeout checks
			if (currentTurn === 'white' && timeControl.white <= 0) {
				// White ran out of time
				clearInterval(timeControl.timerId);
				timeControl.timerId = null;
				timeControl.white = 0;
				gameOverWin('white', 'time_out');
			} else if (currentTurn === 'black' && timeControl.black <= 0) {
				// Black ran out of time
				clearInterval(timeControl.timerId);
				timeControl.timerId = null;
				timeControl.black = 0;
				gameOverWin('black', 'time_out');
			}
		}, 100); // Update every 100ms for smoother display
	}

	function playSound(type) {
		try {
			// Make sure the type is valid
			if (!soundEffects[type]) {
				console.error(`Invalid sound type: ${type}`);
				return;
			}

			// Verify sound is loaded
			if (soundEffects[type].readyState === 0) {
				console.warn(`Sound ${type} not loaded yet`);
				// Try to load it
				soundEffects[type].load();
			}

			// Force-stop any playing sounds first
			soundEffects[type].pause();
			soundEffects[type].currentTime = 0;

			// Play with a tiny delay to ensure browser processes it
			setTimeout(() => {
				const playPromise = soundEffects[type].play();
				if (playPromise) {
					playPromise.catch(error => {
						console.warn(`Failed to play ${type} sound:`, error);
					});
				}
			}, 10);
		} catch (error) {
			console.warn(`Error playing ${type} sound:`, error);
		}
	}

	// Example modification - make status updates silent
	function updateStatusMessage(message) {
		// Keep the DOM update for game logic but don't show it
		const statusElement = document.getElementById('status-message');
		if (statusElement) {
			statusElement.textContent = message;
			// Don't change visibility
		}
	}

	function updateBoardBorder() {
		const boardEl = document.getElementById('chessboard');
		if (!boardEl) return;
		boardEl.classList.remove('active-white', 'active-black');
		if (currentTurn === 'white') {
			boardEl.classList.add('active-white');
		} else {
			boardEl.classList.add('active-black');
		}
	}

	function checkForValidMoves(player) {
		const hand = player === 'white' ? whiteHand : blackHand;

		// No cards in hand means no valid moves
		if (hand.length === 0) return false;

		// Try each card to see if it has valid moves
		for (const card of hand) {
			const pieceType = card;
			const enginePieceType = pieceTypeMap[pieceType.toLowerCase()];

			if (!enginePieceType) continue;

			// Use synchronous check for valid moves
			if (hasValidMovesForPiece(chess, enginePieceType)) {
				return true;
			}
		}

		// No valid moves found for any card
		return false;
	}

	function checkCardValiditySynchronous(hand) {
		const validMoves = {};

		for (let i = 0; i < hand.length; i++) {
			const pieceType = hand[i];
			const enginePieceType = pieceTypeMap[pieceType.toLowerCase()];

			if (!enginePieceType) {
				validMoves[i] = false;
				continue;
			}

			// Use synchronous check for this piece type
			validMoves[i] = hasValidMovesForPiece(chess, enginePieceType);
		}

		return validMoves;
	}

	// Helper function to check if a piece type has any valid moves
	function hasValidMovesForPiece(chess, pieceType) {
		// Find the single-character representation for this piece type
		let pieceChar;

		// If it's already a single character (like 'n'), use it
		if (pieceType.length === 1) {
			pieceChar = pieceType.toLowerCase();
		} else {
			// Otherwise, reverse-lookup in the pieceTypeMap
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

		// Rest of your function remains the same
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

	function showPassIndicator() {
		// Create or get pass indicator element
		let passIndicator = document.getElementById('pass-indicator');
		if (!passIndicator) {
			passIndicator = document.createElement('div');
			passIndicator.id = 'pass-indicator';
			passIndicator.className = 'pass-indicator';
			passIndicator.textContent = 'PASS';
			document.getElementById('board-container').appendChild(passIndicator);
		}

		// Make visible with animation
		setTimeout(() => {
			passIndicator.style.opacity = '1';
			passIndicator.style.visibility = 'visible';

			// Hide after 1 second
			setTimeout(() => {
				passIndicator.style.opacity = '0';
				passIndicator.style.visibility = 'hidden';
			}, 1000);
		}, 50);
	}

	function gameOverWin(playerColor, winCondition) {
		// Set game over state
		gameOver = true;

		// Stop the clock
		if (timeControl.timerId) {
			clearInterval(timeControl.timerId);
			timeControl.timerId = null;
		}

		if (playerColor && MetachessSocket && MetachessSocket.isConnected()) {
			const winner = playerColor === 'white' ? 'black' : 'white';

			// This ensures the server stops the clock for both players
			MetachessSocket.sendGameOver({
				gameId: MetachessSocket.gameId,
				winner: winner,
				loser: playerColor,
				reason: winCondition
			});
		}

		// Determine winner based on player who lost
		const winner = playerColor === 'white' ? 'BLACK' : 'WHITE';

		// Create appropriate message based on win condition
		let statusMessage;
		switch (winCondition) {
			case 'no_cards':
				statusMessage = `${playerColor.toUpperCase()} has no cards in deck and no valid moves! ${winner} WINS!`;
				break;
			case 'king_capture':
				statusMessage = `${winner} captured the king and WINS!`;
				break;
			case 'checkmate':
				statusMessage = `CHECKMATE! ${winner} WINS!`;
				break;
			case 'time_out':
				statusMessage = `${playerColor.toUpperCase()} ran out of time! ${winner} WINS!`;
				break;
			case 'resignation':
				statusMessage = `${playerColor.toUpperCase()} resigned. ${winner} WINS!`;
				break;
			default:
				statusMessage = `Game over! ${winner} WINS!`;
		}

		// Apply gray style to all control elements
		document.querySelectorAll('.deck-info, .timer, .pass-button')
			.forEach(element => {
				element.classList.add('game-over');
			});

		document.querySelectorAll('.piece-card').forEach(card => {
			const clone = card.cloneNode(true);
			clone.classList.add('game-over'); // Also add game-over class to cards
			card.parentNode.replaceChild(clone, card);
		});

		// Update status message
		updateStatusMessage(statusMessage);

		// Disable controls
		disableAllControls();

		// Play game end sound
		playSound('win');
		return statusMessage;
	}

	function highlightKingInCheck() {
		// Clear any existing check highlights
		document.querySelectorAll('.square-55d63').forEach(square => {
			square.classList.remove('check-highlight');
		});

		// Check if a king is in check
		if (chess.in_check()) {
			// Find the king's position
			const color = chess.turn();
			const squares = chess.board();

			// Loop through the board to find the king of the current turn
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					const piece = squares[row][col];
					if (piece && piece.type === 'k' && piece.color === color) {
						// Convert to algebraic notation
						const file = String.fromCharCode('a'.charCodeAt(0) + col);
						const rank = 8 - row;
						const square = file + rank;


						// Add highlighting class to the square
						document.querySelector(`.square-${square}`).classList.add('check-highlight');
						return;
					}
				}
			}
		}
	}
	function checkForCheckmate() {
		// Use chess.js built-in checkmate detection
		if (chess.in_checkmate()) {
			console.log(`CHECKMATE detected! ${currentTurn.toUpperCase()} loses`);

			// The player whose turn it is has been checkmated
			const losingPlayer = currentTurn;
			const winningPlayer = losingPlayer === 'white' ? 'black' : 'white';

			// End the game with checkmate condition
			gameOverWin(losingPlayer, 'checkmate');

			// If in multiplayer, notify the other player
			if (playerColor && MetachessSocket.isConnected()) {
				console.log("Sending checkmate game over notification");
				MetachessSocket.sendGameOver({
					gameId: MetachessSocket.gameId,
					winner: winningPlayer,
					loser: losingPlayer,
					reason: 'checkmate'
				});
			}

			return true;
		}
		return false;
	}

	function resetGame() {
		// Stop the clock if it's running
		if (timeControl.timerId) {
			clearInterval(timeControl.timerId);
			timeControl.timerId = null;
		}

		// Reset game state variables
		gameOver = false;
		currentTurn = 'white';
		selectedCard = null;
		playerColor = null; // Reset to single player mode

		// Reset time control
		timeControl = {
			white: 180,  // 3 minutes in seconds
			black: 180,
			started: false,
			timerId: null
		};

		// Reset the chess board to starting position
		chess.reset();
		board.position('start');
		board.orientation('white'); // Reset orientation to white
		updateClockOrientation();
		updateMaterialDisplay();
		// Clear any move highlighting
		updateLastMoveHighlighting(null, null);

		// Initialize new decks with appropriate case
		whiteDeck = MetachessDeck.createDeck();
		blackDeck = MetachessDeck.createDeck().map(piece => piece.toUpperCase());

		// Draw initial hands
		whiteHand = MetachessDeck.drawCards(whiteDeck, 5);
		blackHand = MetachessDeck.drawCards(blackDeck, 5);

		// Update UI
		updateDecks();
		updateHands();
		updateClockDisplay();
		updateBoardBorder();

		// Enable controls for current player
		togglePlayerControls();

		// Update status message
		updateStatusMessage("New game started");

		// Remove game-over styling from elements
		document.querySelectorAll('.game-over').forEach(element => {
			element.classList.remove('game-over');
		});
	}

	// Add these testing helper methods
	function setTimeControl(newTimeControl) {
		timeControl = newTimeControl;
		updateClockDisplay();

		// Start the clock if it should be started
		if (timeControl.started && !timeControl.timerId) {
			console.log("Starting clock with time control");
			startClock();
		}
	}

	function setTurn(turn) {
		currentTurn = turn;
		togglePlayerControls();
	}

	function attemptRedrawsUntilValidMove(player) {
		// Helper function to check if any card in hand has valid moves
		const hasValidMove = checkForValidMoves(player);

		// If player already has valid moves, nothing to do
		if (hasValidMove) return;

		// Get the player's deck and hand references
		const deck = player === 'white' ? whiteDeck : blackDeck;
		const hand = player === 'white' ? whiteHand : blackHand;

		// If deck is empty and no valid moves, player loses
		if (deck.length === 0) {
			gameOverWin(player, 'no_cards');
			return;
		}

		// Show animation or message about redrawing
		updateStatusMessage(`${player.toUpperCase()} has no valid moves. Redrawing cards...`);

		// Discard current hand and prepare for redrawing
		if (player === 'white') {
			whiteHand = [];
		} else {
			blackHand = [];
		}

		// Update UI to show empty hand
		updateHands();

		// Add delay before redrawing
		setTimeout(() => {
			// Draw new cards
			if (player === 'white') {
				whiteHand = MetachessDeck.drawCards(whiteDeck, Math.min(5, whiteDeck.length));
			} else {
				blackHand = MetachessDeck.drawCards(blackDeck, Math.min(5, blackDeck.length));
			}

			// Update UI
			updateDecks();
			updateHands();

			// Play a sound
			// Check if the new hand has valid moves
			const nowHasValidMove = checkForValidMoves(player);

			if (!nowHasValidMove) {
				// If still no valid moves and deck not empty, try again after delay
				if ((player === 'white' && whiteDeck.length > 0) ||
					(player === 'black' && blackDeck.length > 0)) {
					setTimeout(() => attemptRedrawsUntilValidMove(player), 1000);
				} else {
					// No more cards in deck and still no valid moves
					gameOverWin(player, 'no_cards');
				}
			} else {
				// Valid move found, update status
				updateStatusMessage(`${player.toUpperCase()} found a playable card`);
			}
		}, 1000);
	}

	function createMaterialDisplay() {
		// Instead of creating new elements, just make sure they're correctly set up
		const topMaterial = document.querySelector('.top-material');
		const bottomMaterial = document.querySelector('.bottom-material');

		if (!topMaterial || !bottomMaterial) {
			console.error("Material difference containers not found in the DOM");
			return;
		}

		// Clear any previous content
		topMaterial.innerHTML = '';
		bottomMaterial.innerHTML = '';

		// Add placeholder spacers to maintain height when empty
		const topSpacer = document.createElement('div');
		topSpacer.className = 'material-spacer';
		topMaterial.appendChild(topSpacer);

		const bottomSpacer = document.createElement('div');
		bottomSpacer.className = 'material-spacer';
		bottomMaterial.appendChild(bottomSpacer);

		// Initial update
		updateMaterialDisplay();
	}

	// Function to calculate material difference
	// Function to calculate material difference
	function calculateMaterialDifference() {
		const pieceValues = {
			'p': 1,   // pawn
			'n': 3,   // knight
			'b': 3,   // bishop
			'r': 5,   // rook
			'q': 9,   // queen
			'k': 0    // king (not counted in material difference)
		};

		let whiteMaterial = 0;
		let blackMaterial = 0;

		// Track the pieces for each side
		const whitePieces = { p: 0, n: 0, b: 0, r: 0, q: 0 };
		const blackPieces = { p: 0, n: 0, b: 0, r: 0, q: 0 };

		// Get the current board position
		const board = chess.board();

		// Iterate through the board and add up material
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const square = board[row][col];
				if (square) {
					const pieceType = square.type.toLowerCase();
					const value = pieceValues[pieceType];

					if (square.color === 'w') {
						whiteMaterial += value;
						if (pieceType !== 'k') whitePieces[pieceType]++;
					} else {
						blackMaterial += value;
						if (pieceType !== 'k') blackPieces[pieceType]++;
					}
				}
			}
		}

		// Calculate the pieces that make up the advantage
		const whitePieceAdvantage = {};
		const blackPieceAdvantage = {};

		// Compare piece counts
		['p', 'n', 'b', 'r', 'q'].forEach(pieceType => {
			const diff = whitePieces[pieceType] - blackPieces[pieceType];
			if (diff > 0) {
				whitePieceAdvantage[pieceType] = diff;
			} else if (diff < 0) {
				blackPieceAdvantage[pieceType] = -diff;
			}
		});

		return {
			difference: whiteMaterial - blackMaterial,
			whiteMaterial,
			blackMaterial,
			whitePieceAdvantage,
			blackPieceAdvantage
		};
	}

	// Function to update the material difference display
	// Function to update the material difference display
	function updateMaterialDisplay() {


		const materialInfo = calculateMaterialDifference();
		const difference = materialInfo.difference;

		const topMaterial = document.querySelector('.top-material');
		const bottomMaterial = document.querySelector('.bottom-material');

		if (!topMaterial || !bottomMaterial) return;

		// Clear previous classes and content
		topMaterial.classList.remove('advantage-white', 'advantage-black');
		bottomMaterial.classList.remove('advantage-white', 'advantage-black');
		topMaterial.innerHTML = '';
		bottomMaterial.innerHTML = '';

		// If no material difference, show nothing but maintain the space
		if (difference === 0) {
			// Add spacers to reserve space
			const topSpacer = document.createElement('div');
			topSpacer.className = 'material-spacer';
			topMaterial.appendChild(topSpacer);

			const bottomSpacer = document.createElement('div');
			bottomSpacer.className = 'material-spacer';
			bottomMaterial.appendChild(bottomSpacer);
			return;
		}

		console.log("Material difference updated:", difference);
		// Function to create the piece display
		const createPieceDisplay = (pieceAdvantage, color) => {
			const container = document.createElement('div');
			container.className = 'piece-symbols';

			// Order of pieces for display (highest value first)
			const pieceOrder = ['q', 'r', 'b', 'n', 'p'];

			pieceOrder.forEach(pieceType => {
				const count = pieceAdvantage[pieceType] || 0;
				for (let i = 0; i < count; i++) {
					const pieceColor = color === 'white' ? 'w' : 'b';
					const pieceChar = pieceType.toUpperCase();
					const lichessPiece = `${pieceColor}${pieceChar}`;
					const pieceUrl = `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${lichessPiece}.svg`;

					const pieceImg = document.createElement('img');
					pieceImg.src = pieceUrl;
					pieceImg.alt = `${color} ${pieceType}`;
					pieceImg.className = 'piece-image';

					container.appendChild(pieceImg);
				}
			});

			return container;
		};

		// Handle the case where the board is flipped (player is black)
		if (playerColor === 'black') {
			// Board is flipped (black at bottom)
			if (difference > 0) {
				// White is ahead
				const pieceDisplay = createPieceDisplay(materialInfo.whitePieceAdvantage, 'white');
				topMaterial.appendChild(pieceDisplay);
				topMaterial.classList.add('advantage-white');
				// Add spacer to bottom to keep height
				const bottomSpacer = document.createElement('div');
				bottomSpacer.className = 'material-spacer';
				bottomMaterial.appendChild(bottomSpacer);
			} else if (difference < 0) {
				// Black is ahead
				const pieceDisplay = createPieceDisplay(materialInfo.blackPieceAdvantage, 'black');
				bottomMaterial.appendChild(pieceDisplay);
				bottomMaterial.classList.add('advantage-black');
				// Add spacer to top to keep height
				const topSpacer = document.createElement('div');
				topSpacer.className = 'material-spacer';
				topMaterial.appendChild(topSpacer);
			}
		} else {
			// Default orientation (white at bottom)
			if (difference > 0) {
				// White is ahead
				const pieceDisplay = createPieceDisplay(materialInfo.whitePieceAdvantage, 'white');
				bottomMaterial.appendChild(pieceDisplay);
				bottomMaterial.classList.add('advantage-white');
				// Add spacer to top to keep height
				const topSpacer = document.createElement('div');
				topSpacer.className = 'material-spacer';
				topMaterial.appendChild(topSpacer);
			} else if (difference < 0) {
				// Black is ahead
				const pieceDisplay = createPieceDisplay(materialInfo.blackPieceAdvantage, 'black');
				topMaterial.appendChild(pieceDisplay);
				topMaterial.classList.add('advantage-black');
				// Add spacer to bottom to keep height
				const bottomSpacer = document.createElement('div');
				bottomSpacer.className = 'material-spacer';
				bottomMaterial.appendChild(bottomSpacer);
			}
		}
	}

	return {

		createMultiplayer() {
			return Multiplayer.createMultiplayer({
				MetachessSocket,
				setupSocketListeners: setupSocketListenersWrapper,
				updateStatusMessage
			});
		},
		joinMultiplayer({ storedSession, urlGameId, gameId }) {
			return Multiplayer.joinMultiplayer({
				MetachessSocket,
				setupSocketListeners: setupSocketListenersWrapper,
				updateStatusMessage,
				storedSession,
				urlGameId,
				gameId
			});
		},


		init,
		multiplayerInit,
		passTurn,
		resetGame,
		gameOverWin,
		// New methods for testing
		getCurrentTurn() {
			return currentTurn;
		},
		getWhiteHand() {
			return [...whiteHand]; // Return a copy to prevent test from modifying original
		},
		getBlackHand() {
			return [...blackHand];
		},
		isGameOver() {
			return gameOver;
		},
		getTimeControl() {
			return { ...timeControl };  // Return a copy to prevent modification
		},
		selectCard, // Expose this existing method
		setTimeControl, // Expose for testing purposes
		setTurn, // Expose for testing purposes
		updateStatusMessage, // Expose for testing purposes
		disableAllControls // Expose for testing purposes
	};
})();

// Expose these for testing purposes
window.MetachessGame = {
	...MetachessGame
	// No need to add individual functions here, they're already in MetachessGame object
};

export { MetachessGame };