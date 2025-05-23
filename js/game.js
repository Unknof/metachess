const MetachessGame = (function () {
	// Game state
	let whiteDeck = [];
	let whiteHand = [];
	let blackDeck = [];
	let blackHand = [];
	let currentTurn = 'white'; // white or black
	let gameOver = false;
	let board = null;
	let chess = null;
	let selectedCard = null;
	let selectedSquare = null; // Added selectedSquare variable
	let engineInitialized = false;
	let playerColor = null; // 'white', 'black', or null (for local play)

	// Add timer variables
	let whiteTime = 180; // 3 minutes in seconds
	let blackTime = 180;
	let timerInterval = null;
	let activeTimer = null;

	const pieceTypeMap = {
		p: 'pawn',
		n: 'knight',
		b: 'bishop',
		r: 'rook',
		q: 'queen',
		k: 'king'
	};

	// Function to format time
	function formatTime(seconds) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs < 10 ? '0' + secs : secs}`;
	}

	// Function to update timer displays
	function updateTimerDisplay() {
		document.getElementById('white-timer').textContent = formatTime(whiteTime);
		document.getElementById('black-timer').textContent = formatTime(blackTime);

		// Add visual cue for low time (less than 30 seconds)
		if (whiteTime < 30) {
			document.getElementById('white-timer').classList.add('timer-low');
		} else {
			document.getElementById('white-timer').classList.remove('timer-low');
		}

		if (blackTime < 30) {
			document.getElementById('black-timer').classList.add('timer-low');
		} else {
			document.getElementById('black-timer').classList.remove('timer-low');
		}
	}

	// Function to start the timer
	function startTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
		}

		activeTimer = currentTurn;

		timerInterval = setInterval(() => {
			if (activeTimer === 'white') {
				whiteTime -= 0.1; // Decrease by 0.1 second for smoother display
				if (whiteTime <= 0) {
					whiteTime = 0;
					clearInterval(timerInterval);
					// Only display flagging locally - server will confirm
					document.getElementById('status-message').textContent = 'WHITE out of time!';
				}
			} else {
				blackTime -= 0.1;
				if (blackTime <= 0) {
					blackTime = 0;
					clearInterval(timerInterval);
					// Only display flagging locally - server will confirm
					document.getElementById('status-message').textContent = 'BLACK out of time!';
				}
			}

			updateTimerDisplay();
		}, 100); // Update every 100ms for smoother countdown
	}

	// Function to stop the timer
	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	function init(chessInstance, boardInstance) {
		chess = chessInstance;
		board = boardInstance;

		console.log("Initializing game...");

		// Clear any move highlighting
		updateLastMoveHighlighting(null, null);

		// Initialize decks with appropriate case
		whiteDeck = MetachessDeck.createDeck();
		blackDeck = MetachessDeck.createDeck().map(piece => piece.toUpperCase());

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
			document.getElementById('status-message').textContent = "Warning: Stockfish engine not available";
		}

		// Enable controls for current player
		togglePlayerControls();

		// Update hands (with active status)
		updateHands();

		// Initialize timers
		whiteTime = 180; // 3 minutes
		blackTime = 180;
		updateTimerDisplay();

		// Start timer if it's a multiplayer game
		if (playerColor) {
			startTimer();
		}
	}

	function updateDecks() {
		document.getElementById('white-deck-count').textContent = whiteDeck.length;
		document.getElementById('black-deck-count').textContent = blackDeck.length;
	}

	function updateHands() {
		console.log("Updating hands, current turn:", currentTurn);

		// Remove existing listeners first
		const allCards = document.querySelectorAll('.piece-card');
		allCards.forEach(card => {
			card.replaceWith(card.cloneNode(true)); // Clone to remove event listeners
		});

		// Check if we're in multiplayer mode
		if (playerColor) {
			// In multiplayer, only show actual cards for the player's color
			if (playerColor === 'white') {
				// White player - show white cards, hide black cards
				MetachessDeck.renderCards(whiteHand, 'white-cards', 'white', currentTurn === 'white');
				renderCardBacks(blackHand.length, 'black-cards');
			} else {
				// Black player - show black cards, hide white cards
				renderCardBacks(whiteHand.length, 'white-cards');
				MetachessDeck.renderCards(blackHand, 'black-cards', 'black', currentTurn === 'black');
			}
		} else {
			// In single player, show both hands
			MetachessDeck.renderCards(whiteHand, 'white-cards', 'white', currentTurn === 'white');
			MetachessDeck.renderCards(blackHand, 'black-cards', 'black', currentTurn === 'black');
		}

		// Add event listeners to current player's cards only
		const activeContainerId = `${currentTurn}-cards`;
		console.log("Adding listeners to:", activeContainerId);

		const activeCards = document.querySelectorAll(`#${activeContainerId} .piece-card`);
		activeCards.forEach(card => {
			card.addEventListener('click', () => {
				console.log("Card clicked:", card.dataset.pieceType, card.dataset.index);
				selectCard(card.dataset.pieceType, parseInt(card.dataset.index));
			});
		});

		// Clear selection
		selectedCard = null;
		clearCardSelection();
	}

	// Add this new function to render card backs instead of actual cards
	function renderCardBacks(count, containerId) {
		const container = document.getElementById(containerId);
		container.innerHTML = '';

		for (let i = 0; i < count; i++) {
			const cardBack = document.createElement('div');
			cardBack.className = 'piece-card card-back';
			cardBack.innerHTML = '<div class="card-inner">?</div>';
			container.appendChild(cardBack);
		}
	}

	function togglePlayerControls() {
		console.log("Toggle controls for turn:", currentTurn);

		// Enable/disable controls based on current turn - REMOVED redraw buttons
		document.getElementById('white-pass').disabled = (currentTurn !== 'white');
		document.getElementById('black-pass').disabled = (currentTurn !== 'black');

		// Update status message
		const playerName = currentTurn.toUpperCase();
		document.getElementById('status-message').textContent = `${playerName}'s turn`;
	}

	function selectCard(pieceType, index) {
		// If this is a multiplayer game, verify it's the player's turn
		if (playerColor && currentTurn !== playerColor) {
			document.getElementById('status-message').textContent = "Not your turn";
			return;
		}

		console.log('Selected piece type:', pieceType, 'at index:', index, 'Current turn:', currentTurn);

		// 1-letter code: lowercase = white, uppercase = black
		const isWhitePiece = pieceType === pieceType.toLowerCase();
		const isBlackPiece = pieceType === pieceType.toUpperCase();

		if ((currentTurn === 'white' && isBlackPiece) ||
			(currentTurn === 'black' && isWhitePiece)) {
			console.error("Wrong player trying to move!");
			document.getElementById('status-message').textContent = `It's ${currentTurn}'s turn!`;
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
			document.getElementById('status-message').textContent = "Thinking...";

			const enginePieceType = pieceTypeMap[pieceType.toLowerCase()];
			if (!enginePieceType) {
				console.error("Invalid piece type:", pieceType);
				document.getElementById('status-message').textContent = "Invalid piece type!";
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

					if (moveStr && moveStr.length >= 4) {
						from = moveStr.substring(0, 2);
						to = moveStr.substring(2, 4);
						promotion = moveStr.length > 4 ? moveStr.substring(4, 5) : undefined;

						// NEW: Check if the target square has a king
						const targetSquare = chess.get(to);
						isKingCapture = targetSquare && targetSquare.type === 'k';

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

						// Highlight the move that was just made - now using variables from the wider scope
						updateLastMoveHighlighting(move.from, move.to);

						// NEW: If a king was captured, declare the capturing player as winner
						if (isKingCapture) {
							const winner = currentTurn === 'white' ? 'WHITE' : 'BLACK';
							document.getElementById('status-message').textContent = `${winner} captured the king and WINS!`;
							gameOver = true;
							disableAllControls();
						} else {
							// Check game status if no king was captured
							checkGameStatus();
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
						}
					} else {
						console.error("Move was not legal:", moveStr);
						document.getElementById('status-message').textContent = `No valid ${pieceType} move found`;

						// Don't remove the card since the move failed
					}
				})
				.catch(error => {
					console.error("Engine error:", error);
					document.getElementById('status-message').textContent = `No valid ${pieceType} moves available`;

					// Don't remove the card since there was an error
				});
		} else {
			document.getElementById('status-message').textContent = "Stockfish not available. Choose another card";
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
		}

		// If using Stockfish, reset it with the new position
		if (engineInitialized && window.engine) {
			window.engine.postMessage('position fen ' + chess.fen());
			window.engine.postMessage('ucinewgame'); // Reset the engine completely
		}

		// Restart timer for new player
		if (playerColor) {
			activeTimer = currentTurn;
		}

		// Update UI
		togglePlayerControls();
		updateHands();

		// Update game status to show active game
		if (playerColor) {
			if (currentTurn === playerColor) {
				document.getElementById('game-status').textContent = 'Your turn';
			} else {
				document.getElementById('game-status').textContent = 'Opponent\'s turn';
			}
		} else {
			document.getElementById('game-status').textContent = `${currentTurn.toUpperCase()}'s turn`;
		}
	}

	function checkGameStatus() {
		// Check standard chess conditions
		if (chess.in_checkmate()) {
			const winner = chess.turn() === 'w' ? 'BLACK' : 'WHITE';
			document.getElementById('status-message').textContent = `CHECKMATE! ${winner} wins!`;
			gameOver = true;
		} else if (chess.in_stalemate()) {
			document.getElementById('status-message').textContent = 'STALEMATE! Game is a draw.';
			gameOver = true;
		} else if (chess.in_draw()) {
			document.getElementById('status-message').textContent = 'DRAW! Game is a draw.';
			gameOver = true;
		} else if (chess.in_check()) {
			const inCheck = chess.turn() === 'w' ? 'WHITE' : 'BLACK';
			document.getElementById('status-message').textContent = `${inCheck} is in CHECK!`;
		}

		// NEW: Check for no playable cards win condition
		if (!gameOver) {
			const whiteHasCards = hasPlayableCards('white');
			const blackHasCards = hasPlayableCards('black');

			if (!whiteHasCards) {
				document.getElementById('status-message').textContent = 'WHITE has no playable cards! BLACK wins!';
				gameOver = true;
			} else if (!blackHasCards) {
				document.getElementById('status-message').textContent = 'BLACK has no playable cards! WHITE wins!';
				gameOver = true;
			}
		}

		// If game is over, disable all controls
		if (gameOver) {
			disableAllControls();

			// Notify other player in multiplayer mode
			if (playerColor && MetachessSocket.isConnected()) {
				MetachessSocket.sendGameOver({
					gameId: MetachessSocket.gameId,
					winner: gameOver ? (currentTurn === 'white' ? 'black' : 'white') : null,
					reason: document.getElementById('status-message').textContent
				});
			}
		}

		return gameOver;
	}

	// Add helper function to check if a player has playable cards
	function hasPlayableCards(color) {
		if (color === 'white') {
			return whiteHand.length > 0 || whiteDeck.length > 0;
		} else {
			return blackHand.length > 0 || blackDeck.length > 0;
		}
	}

	// Fix the handlePassInMultiplayer function
	function handlePassInMultiplayer() {
		if (!playerColor || currentTurn !== playerColor) {
			document.getElementById('status-message').textContent = "Not your turn";
			return;
		}

		// Add detailed debug logging
		console.log("Pass attempt details:", {
			playerColor,
			currentTurn,
			gameId: MetachessSocket.gameId,
			isConnected: MetachessSocket.getConnectionInfo().connected
		});

		// Send pass message to server
		const result = MetachessSocket.sendPass({
			player: playerColor,
			gameId: MetachessSocket.gameId
		});

		console.log("Pass message sent result:", result);

		// Disable controls until server confirms the pass
		disableAllControls();
		document.getElementById('status-message').textContent = "Passing turn...";

		// Don't change any state here - wait for the server's pass_update message
	}

	// Update the existing pass functions to use multiplayer when appropriate
	function passTurn() {
		if (gameOver) return;

		console.log("Passing turn for:", currentTurn);

		// Check if we're in multiplayer mode
		if (playerColor && MetachessSocket.getConnectionInfo().connected) {
			handlePassInMultiplayer();
			return;
		}

		// Original singleplayer pass logic
		// Simply switch turns
		switchTurn();
	}

	// Update your initMultiplayer function
	function initMultiplayer() {
		// Initialize socket connection and return the promise
		return MetachessSocket.init()
			.then(success => {
				if (success) {
					console.log('Socket connection successful, ready for multiplayer');
					setupSocketListeners();

					// Check for game ID in URL - AFTER socket is connected
					const urlParams = new URLSearchParams(window.location.search);
					const gameId = urlParams.get('game');

					if (gameId) {
						console.log('Found game ID in URL, joining game:', gameId);
						// Add a slight delay to ensure socket is ready
						setTimeout(() => {
							MetachessSocket.joinGame(gameId);
						}, 300);
					} else {
						// Only show multiplayer options if not joining a game
						showMultiplayerOptions();
						return true; // Return success
					}
					return true; // Return success
				}
				return false; // Return failure
			})
			.catch(error => {
				console.error('Failed to initialize multiplayer:', error);
				document.getElementById('status-message').textContent = 'Multiplayer unavailable. Playing in single-player mode.';
				return false; // Return failure
			});
	}

	function setupSocketListeners() {
		// Listen for game created event
		MetachessSocket.on('game_created', (data) => {
			console.log('Game created:', data);
			MetachessSocket.setGameInfo(data.gameId, data.playerColor);
			playerColor = data.playerColor;  // This is important - set playerColor immediately

			// Set initial deck and hand state
			whiteDeck = Array(data.whiteDeck).fill('?');
			whiteHand = data.whiteHand;
			blackDeck = Array(data.blackDeck).fill('?');
			blackHand = data.blackHand;

			// Update UI
			updateDecks();
			updateHands();

			// Update UI to show waiting for opponent
			document.getElementById('game-status').textContent = 'Waiting for opponent to join...';
			document.getElementById('game-link').value = `${window.location.href}?game=${data.gameId}`;
			document.getElementById('waiting-modal').style.display = 'flex';

			// Disable controls until opponent joins
			disableAllControls();
		});

		// Update the opponent_joined handler
		MetachessSocket.on('opponent_joined', (data) => {
			console.log('Opponent joined the game:', data);

			// Clear the waiting modal
			document.getElementById('waiting-modal').style.display = 'none';
			document.getElementById('multiplayer-modal').style.display = 'none';

			// Make sure playerColor is set
			if (!playerColor && data.creatorColor) {
				playerColor = data.creatorColor;
			}

			// Show notification
			document.getElementById('status-message').textContent =
				`Opponent joined! You are playing as ${playerColor.toUpperCase()}`;

			// Initialize with correct color - this is the key fix!
			initializeWithColor(playerColor);

			// Toggle controls
			togglePlayerControls();
		});

		// ADD THIS HANDLER for game_joined event
		MetachessSocket.on('game_joined', (data) => {
			console.log('Game joined:', data);

			// Set game ID and player color
			MetachessSocket.setGameInfo(data.gameId, data.playerColor);
			playerColor = data.playerColor;

			// Clear any open modals
			document.getElementById('multiplayer-modal').style.display = 'none';
			document.getElementById('waiting-modal').style.display = 'none';

			// Set initial deck and hand state
			whiteDeck = Array(data.whiteDeck).fill('?');
			blackDeck = Array(data.blackDeck).fill('?');

			// Update hands based on player color
			if (playerColor === 'white') {
				whiteHand = data.whiteHand;
			} else {
				blackHand = data.blackHand;
			}

			// Initialize with player color
			initializeWithColor(playerColor);

			// Show notification
			document.getElementById('status-message').textContent =
				`You joined the game! You are playing as ${playerColor.toUpperCase()}`;

			// Update game status
			document.getElementById('game-status').textContent =
				currentTurn === playerColor ? 'Your turn' : 'Opponent\'s turn';
		});

		// Complete the pass_update handler
		MetachessSocket.on('pass_update', (data) => {
			console.log('Pass update received:', data);

			// Update decks and hands
			whiteDeck = Array(data.whiteDeck).fill('?');
			blackDeck = Array(data.blackDeck).fill('?');

			// Update hands based on player color
			if (playerColor === 'white') {
				whiteHand = data.whiteHand;
			} else if (playerColor === 'black') {
				blackHand = data.blackHand;
			}

			// Synchronize with server's game state
			synchronizeGameState(data.currentTurn);

			// Show pass message
			const passingPlayer = data.passingPlayer === playerColor ? 'You' : 'Opponent';
			document.getElementById('status-message').textContent = `${passingPlayer} passed the turn`;
		});

		// Add handler for opponent_move
		MetachessSocket.on('opponent_move', (data) => {
			console.log('Opponent move received:', data);

			// Apply the move to the board
			applyOpponentMove(data.move);

			// Update deck and hand information
			whiteDeck = Array(data.whiteDeck).fill('?');
			blackDeck = Array(data.blackDeck).fill('?');

			// Update hands based on player color
			if (playerColor === 'white') {
				whiteHand = data.whiteHand;
			} else {
				blackHand = data.blackHand;
			}

			// Synchronize with server's game state
			synchronizeGameState(data.currentTurn);

			// Status messages
			document.getElementById('status-message').textContent = 'Opponent made a move';
		});

		// Update the hand_update handler
		MetachessSocket.on('hand_update', (data) => {
			console.log('Hand update received:', data);

			// Update deck counts and hands
			whiteDeck = Array(data.whiteDeck).fill('?');
			blackDeck = Array(data.blackDeck).fill('?');

			// Update hands based on player color
			if (playerColor === 'white') {
				whiteHand = data.whiteHand;
			} else if (playerColor === 'black') {
				blackHand = data.blackHand;
			}

			// Synchronize with server's game state
			synchronizeGameState(data.currentTurn);
		});

		// Add time control update handler
		MetachessSocket.on('move_made', (data) => {
			// Update timers from server data
			if (data.timeControl) {
				whiteTime = data.timeControl.white;
				blackTime = data.timeControl.black;
				updateTimerDisplay();

				// If it's our turn, start the timer
				if (currentTurn === playerColor) {
					startTimer();
				}
			}

			// Rest of your move_made handler...
		});

		// Add timeout handler
		MetachessSocket.on('time_out', (data) => {
			stopTimer();
			gameOver = true;

			const loser = data.player.toUpperCase();
			const winner = (data.player === 'white' ? 'BLACK' : 'WHITE');

			document.getElementById('status-message').textContent =
				`${loser} ran out of time! ${winner} wins!`;

			disableAllControls();
		});
	}

	// Update your showMultiplayerOptions function
	function showMultiplayerOptions() {
		// Show multiplayer modal
		const modal = document.getElementById('multiplayer-modal');
		modal.style.display = 'flex';
		modal.style.opacity = '1';
		modal.style.visibility = 'visible';
		console.log('Set multiplayer modal display to flex');

		// DO NOT add event listeners here - they're handled in app.js
	}

	function initializeWithColor(color) {
		// Initialize game state for specific color
		currentTurn = 'white'; // Game always starts with white
		playerColor = color;

		// Determine which hand is controlled by the player
		playerHand = playerColor === 'white' ? whiteHand : blackHand;
		opponentHand = playerColor === 'white' ? blackHand : whiteHand;

		// Update game status based on whose turn it is
		if (currentTurn === playerColor) {
			document.getElementById('game-status').textContent = 'Your turn';
		} else {
			document.getElementById('game-status').textContent = 'Opponent\'s turn';
		}

		// Update controls based on whose turn it is
		togglePlayerControls();

		// Update the hands to hide opponent cards
		updateHands();
	}

	function applyOpponentMove(moveData) {
		// Extract move data
		const { from, to, promotion } = moveData;

		// NEW: Check if the target square has a king
		const targetSquare = chess.get(to);
		const isKingCapture = targetSquare && targetSquare.type === 'k';

		// Make the move on the chess board
		const move = chess.move({
			from: from,
			to: to,
			promotion: promotion
		});

		if (move) {
			// Update board display
			board.position(chess.fen());

			// Highlight last move
			updateLastMoveHighlighting(move.from, move.to);

			// NEW: If a king was captured, declare the capturing player as winner
			if (isKingCapture) {
				const winner = currentTurn === 'white' ? 'WHITE' : 'BLACK';
				document.getElementById('status-message').textContent = `${winner} captured the king and WINS!`;
				gameOver = true;
				disableAllControls();

				// Notify other player in multiplayer mode
				if (playerColor && MetachessSocket.isConnected()) {
					MetachessSocket.sendGameOver({
						gameId: MetachessSocket.gameId,
						winner: currentTurn,
						reason: `${winner} captured the king`
					});
				}
			} else {
				// Only check other game status if no king was captured
				checkGameStatus();
			}
		}
	}

	function removeCardFromOpponentHand(index) {
		// Determine current opponent
		const opponentIsWhite = currentTurn === 'white';

		if (opponentIsWhite) {
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

	function disableAllControls() {
		// Removed redraw buttons
		document.getElementById('white-pass').disabled = true;
		document.getElementById('black-pass').disabled = true;
	}

	function setupBoardClickHandler() {
		board.on('click', function (event) {
			// If this is a multiplayer game, check if it's your turn
			if (playerColor && currentTurn !== playerColor) {
				document.getElementById('status-message').textContent = "Not your turn";
				return;
			}

			// Rest of your click handler code...
		});
	}

	// Add this helper function
	function synchronizeGameState(serverTurn) {
		// Update our local turn state
		currentTurn = serverTurn;

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

		// If using Stockfish, reset it with the new position
		if (engineInitialized && window.engine) {
			window.engine.postMessage('position fen ' + chess.fen());
			window.engine.postMessage('ucinewgame');
		}

		// Update UI
		togglePlayerControls();
		updateHands();

		// Update game status
		if (playerColor) {
			document.getElementById('game-status').textContent =
				currentTurn === playerColor ? 'Your turn' : 'Opponent\'s turn';
		} else {
			document.getElementById('game-status').textContent = `${currentTurn.toUpperCase()}'s turn`;
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

	return {
		init,
		passTurn,
		initMultiplayer,
		startTimer,
		stopTimer,
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
		selectCard // Expose this existing method
	};
})();