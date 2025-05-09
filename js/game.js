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

	function setupMobileCardContainers() {
		const cardContainers = document.querySelectorAll('.card-container');

		cardContainers.forEach(container => {
			// Remove or comment out this block to stop adding the swipe indicator
			/*
			if (window.innerWidth <= 768) {
				const scrollIndicator = document.createElement('div');
				scrollIndicator.className = 'scroll-indicator';
				scrollIndicator.innerHTML = '&laquo; swipe &raquo;';
				container.parentNode.insertBefore(scrollIndicator, container);
			 }
			*/
		});
	}

	// Add button initialization to the init function
	function init(chessInstance, boardInstance) {
		chess = chessInstance;
		board = boardInstance;

		console.log("Initializing game...");

		// Clear any move highlighting
		updateLastMoveHighlighting(null, null);
		setupGameOptionsModal();

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
			updateStatusMessage("Warning: Stockfish engine not available");
		}

		// Enable controls for current player
		togglePlayerControls();

		// Update hands (with active status)
		updateHands();

		// Start the clock
		//startClock();

		setupMobileCardContainers();

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

		// Call setupGameOptionsModal
		setupGameOptionsModal();
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

		if (!playerColor) { // playerColor being null indicates singleplayer mode
			//console.log("Singleplayer mode - checking for valid moves");
			const emptyDeck = currentTurn === 'white' ? (whiteDeck.length === 0) : (blackDeck.length === 0);

			if (emptyDeck) {
				const hasValidMove = checkForValidMoves(currentTurn);
				if (!hasValidMove) {
					// Game over - no cards in deck and no valid moves
					gameOverWin(currentTurn, 'no_cards');
					return;
				} else {
					// Has valid moves - must play one
					updateStatusMessage(`Cannot pass with empty deck. You must play a card.`);
				}
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

	// Fix the handlePassInMultiplayer function
	function handlePassInMultiplayer() {
		if (!playerColor || currentTurn !== playerColor) {
			updateStatusMessage("Not your turn");
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
		updateStatusMessage("Passing turn...");

		// Don't change any state here - wait for the server's pass_update message
	}

	// Update the existing pass functions to use multiplayer when appropriate
	function passTurn() {
		if (gameOver) return;

		console.log("Passing turn for:", currentTurn);

		// Check if we're in multiplayer mode
		if (playerColor && MetachessSocket.getConnectionInfo().connected) {
			console.log("Multiplayer mode detected, using multiplayer pass logic");
			handlePassInMultiplayer();
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
		showPassIndicator();
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
				updateStatusMessage('Multiplayer unavailable. Playing in single-player mode.');
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
			updateStatusMessage('Waiting for opponent to join...');
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
			updateStatusMessage(
				`Opponent joined! You are playing as ${playerColor.toUpperCase()}`
			);

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
			updateStatusMessage(
				`You joined the game! You are playing as ${playerColor.toUpperCase()}`
			);

			// Update game status
			updateStatusMessage(
				currentTurn === playerColor ? 'Your turn' : 'Opponent\'s turn'
			);
		});

		// Update your opponent_move handler
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

			// Update time control if provided
			if (data.timeControl) {
				timeControl.white = data.timeControl.white;
				timeControl.black = data.timeControl.black;

				// Start clock if it hasn't been started yet
				if (!timeControl.started) startClock();

				updateClockDisplay();
			}

			// Synchronize with server's game state
			synchronizeGameState(data.currentTurn);

			// Status messages
			updateStatusMessage('Opponent made a move');
		});

		// Update your pass_update handler
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

			// Update time control if provided
			if (data.timeControl) {
				timeControl.white = data.timeControl.white;
				timeControl.black = data.timeControl.black;

				// Start clock if it hasn't been started yet
				if (!timeControl.started) startClock();

				updateClockDisplay();
			}

			// Synchronize with server's game state
			synchronizeGameState(data.currentTurn);
			updateHands();

			// Show pass indicator
			showPassIndicator();

			// Show pass message
			const passingPlayer = data.passingPlayer === playerColor ? 'You' : 'Opponent';
			updateStatusMessage(`${passingPlayer} passed the turn`);
		});

		// Add handler for time_out messages
		MetachessSocket.on('time_out', (data) => {
			console.log('Time out:', data);

			// Stop the clock
			if (timeControl.timerId) {
				clearInterval(timeControl.timerId);
				timeControl.timerId = null;
			}

			// Update time display to show zero for player who timed out
			timeControl[data.player] = 0;
			updateClockDisplay();

			// Show game over message
			const timeoutPlayer = data.player === playerColor ? 'You' : 'Opponent';
			const winnerText = data.winner === playerColor ? 'You win' : 'You lose';

			updateStatusMessage(
				`${timeoutPlayer} ran out of time. ${winnerText}!`
			);

			// Disable controls
			disableAllControls();
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

		// Flip the board if player is black
		if (board && color === 'black') {
			board.orientation('black');
		}

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
		// Use the single pass button instead of white-pass and black-pass
		const passButton = document.getElementById('pass-turn');
		if (passButton) {
			passButton.disabled = true;
		}
	}

	function setupBoardClickHandler() {
		board.on('click touchend', function (event) {
			// Prevent double-firing on touch devices
			if (event.type === 'touchend') {
				event.preventDefault();
			}

			// If this is a multiplayer game, check if it's your turn
			if (playerColor && currentTurn !== playerColor) {
				updateStatusMessage("Not your turn");
				return;
			}

			// Rest of your click handler code...
		});
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
		document.getElementById('white-time').textContent = formatTime(timeControl.white);
		document.getElementById('black-time').textContent = formatTime(timeControl.black);

		// Highlight active player's clock
		document.querySelector('.white-timer').classList.toggle('active', currentTurn === 'white');
		document.querySelector('.black-timer').classList.toggle('active', currentTurn === 'black');

		// Highlight low time (less than 15 seconds) - apply to timer div, not span
		document.querySelector('.white-timer').classList.toggle('low-time', timeControl.white < 15);
		document.querySelector('.black-timer').classList.toggle('low-time', timeControl.black < 15);
	}

	// Add this function to start the visual countdown timer
	function startClock() {
		if (timeControl.timerId) clearInterval(timeControl.timerId);

		timeControl.started = true;
		timeControl.timerId = setInterval(() => {
			if (currentTurn === 'white') {
				timeControl.white = Math.max(0, timeControl.white - 0.1);
			} else {
				timeControl.black = Math.max(0, timeControl.black - 0.1);
			}
			updateClockDisplay();

			// Add this time-out check
			if (currentTurn === 'white' && timeControl.white <= 0) {
				// White ran out of time
				clearInterval(timeControl.timerId);
				timeControl.timerId = null;
				timeControl.white = 0;
				gameOverWin('black', 'time_out');
			} else if (currentTurn === 'black' && timeControl.black <= 0) {
				// Black ran out of time
				clearInterval(timeControl.timerId);
				timeControl.timerId = null;
				timeControl.black = 0;
				gameOverWin('white', 'time_out');
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

			// End the game with checkmate condition
			gameOverWin(losingPlayer, 'checkmate');

			// If in multiplayer, notify the other player
			if (playerColor && MetachessSocket.isConnected()) {
				MetachessSocket.sendGameOver({
					gameId: MetachessSocket.gameId,
					winner: losingPlayer === 'white' ? 'black' : 'white',
					reason: 'checkmate'
				});
			}

			return true;
		}
		return false;
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

	// Add this function at the end of your MetachessGame module
	function setupGameOptionsModal() {
		// Get modal elements
		const gameOptionsModal = document.getElementById('game-options-modal');
		const concedeConfirmModal = document.getElementById('concede-confirm-modal');

		const menuButton = document.getElementById('menu-button');
		if (menuButton) {
			menuButton.addEventListener('click', function () {
				gameOptionsModal.style.display = 'flex';
			});
		}
		// Setup the multiplayer button to open the options modal
		const multiplayerButton = document.querySelector('.multiplayer-button');
		if (multiplayerButton) {
			// Replace the current click event with our modal
			const newButton = multiplayerButton.cloneNode(true);
			multiplayerButton.parentNode.replaceChild(newButton, multiplayerButton);

			newButton.addEventListener('click', function () {
				gameOptionsModal.style.display = 'flex';
			});
		}

		// Setup button handlers
		document.getElementById('multiplayer-btn').addEventListener('click', function () {
			// Explicitly hide the game options modal
			gameOptionsModal.style.display = 'none';

			// Small delay before showing multiplayer options to ensure DOM updates
			setTimeout(() => {
				showMultiplayerOptions();
			}, 50);
		});

		document.getElementById('concede-button').addEventListener('click', function () {
			gameOptionsModal.style.display = 'none';
			concedeConfirmModal.style.display = 'flex';
		});

		document.getElementById('confirm-concede').addEventListener('click', function () {
			concedeConfirmModal.style.display = 'none';

			// Determine the conceding player
			const concedingPlayer = playerColor || currentTurn;

			// Concede the game
			gameOverWin(concedingPlayer, 'resignation');

			// If in multiplayer, notify the other player
			if (playerColor && MetachessSocket.isConnected()) {
				MetachessSocket.sendGameOver({
					gameId: MetachessSocket.gameId,
					winner: concedingPlayer === 'white' ? 'black' : 'white',
					reason: 'resignation'
				});
			}
		});

		document.getElementById('cancel-concede').addEventListener('click', function () {
			concedeConfirmModal.style.display = 'none';
		});

		// Setup all close buttons
		document.querySelectorAll('.close-modal').forEach(button => {
			button.addEventListener('click', function () {
				gameOptionsModal.style.display = 'none';
				concedeConfirmModal.style.display = 'none';
			});
		});

		// Close modal when clicking outside
		window.addEventListener('click', function (event) {
			if (event.target === gameOptionsModal) {
				gameOptionsModal.style.display = 'none';
			}
			if (event.target === concedeConfirmModal) {
				concedeConfirmModal.style.display = 'none';
			}
		});
	}

	return {
		init,
		passTurn,
		initMultiplayer,
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