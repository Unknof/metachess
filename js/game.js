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

	const pieceTypeMap = {
		p: 'pawn',
		n: 'knight',
		b: 'bishop',
		r: 'rook',
		q: 'queen',
		k: 'king'
	};

	function init(chessInstance, boardInstance) {
		chess = chessInstance;
		board = boardInstance;

		console.log("Initializing game...");

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

		// Re-render both hands
		MetachessDeck.renderCards(whiteHand, 'white-cards', 'white', currentTurn === 'white');
		MetachessDeck.renderCards(blackHand, 'black-cards', 'black', currentTurn === 'black');

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

	function togglePlayerControls() {
		console.log("Toggle controls for turn:", currentTurn);

		// Enable/disable controls based on current turn
		document.getElementById('white-redraw').disabled = (currentTurn !== 'white');
		document.getElementById('white-pass').disabled = (currentTurn !== 'white');
		document.getElementById('black-redraw').disabled = (currentTurn !== 'black');
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
					if (moveStr && moveStr.length >= 4) {
						const from = moveStr.substring(0, 2);
						const to = moveStr.substring(2, 4);
						const promotion = moveStr.length > 4 ? moveStr.substring(4, 5) : undefined;

						// Try to make the move in chess.js format
						move = chess.move({
							from: from,
							to: to,
							promotion: promotion
						});

						console.log("Converted move:", { from, to, promotion });
					}

					if (move) {
						console.log("Move was legal and executed");

						// Update board display
						board.position(chess.fen());

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

						// Check game status
						checkGameStatus();

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

		// Update UI
		togglePlayerControls();
		updateHands();
	}

	function checkGameStatus() {
		// Check if the game is over
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

		// If game is over, disable all controls
		if (gameOver) {
			document.getElementById('white-redraw').disabled = true;
			document.getElementById('white-pass').disabled = true;
			document.getElementById('black-redraw').disabled = true;
			document.getElementById('black-pass').disabled = true;
		}

		return gameOver;
	}

	function redrawHand() {
		if (gameOver) return;

		console.log("Redrawing hand for:", currentTurn);

		// Put current hand back in deck and draw new hand
		if (currentTurn === 'white') {
			whiteDeck = whiteDeck.concat(whiteHand);
			whiteDeck = MetachessDeck.shuffleDeck(whiteDeck);
			whiteHand = MetachessDeck.drawCards(whiteDeck, 5);
		} else {
			blackDeck = blackDeck.concat(blackHand);
			blackDeck = MetachessDeck.shuffleDeck(blackDeck);
			blackHand = MetachessDeck.drawCards(blackDeck, 5);
		}

		// Update UI
		updateDecks();
		updateHands();

		// Switch turn
		switchTurn();
	}

	function passTurn() {
		if (gameOver) return;

		console.log("Passing turn for:", currentTurn);

		// Simply switch turns
		switchTurn();
	}

	function initMultiplayer() {
		// Initialize socket connection
		MetachessSocket.init()
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
					}
				}
			})
			.catch(error => {
				console.error('Failed to initialize multiplayer:', error);
				document.getElementById('status-message').textContent = 'Multiplayer unavailable. Playing in single-player mode.';
			});

		MetachessSocket.on('game_created', (data) => {
			console.log('Game created:', data);
			MetachessSocket.setGameInfo(data.gameId, data.playerColor);
			playerColor = data.playerColor;

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

		MetachessSocket.on('game_joined', (data) => {
			console.log('Game joined:', data);
			MetachessSocket.setGameInfo(data.gameId, data.playerColor);
			playerColor = data.playerColor;

			// Set initial deck and hand state
			whiteDeck = Array(data.whiteDeck).fill('?');
			whiteHand = data.whiteHand;
			blackDeck = Array(data.blackDeck).fill('?');
			blackHand = data.blackHand;
			currentTurn = data.currentTurn;

			// Update UI
			updateDecks();
			updateHands();
			togglePlayerControls();

			// Update UI to show game starting
			document.getElementById('game-status').textContent = 'Game starting - you are playing as BLACK';
			document.getElementById('waiting-modal').style.display = 'none';

			// Initialize game as black
			initializeWithColor('black');
		});
	}

	function setupSocketListeners() {
		// Listen for game created event
		MetachessSocket.on('game_created', (data) => {
			console.log('Game created:', data);
			MetachessSocket.setGameInfo(data.gameId, data.playerColor);

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

		// Listen for game joined event
		MetachessSocket.on('game_joined', (data) => {
			console.log('Game joined:', data);
			MetachessSocket.setGameInfo(data.gameId, data.playerColor);

			// Set initial deck and hand state
			whiteDeck = Array(data.whiteDeck).fill('?');
			whiteHand = data.whiteHand;
			blackDeck = Array(data.blackDeck).fill('?');
			blackHand = data.blackHand;
			currentTurn = data.currentTurn;

			// Update UI
			updateDecks();
			updateHands();
			togglePlayerControls();

			// Update UI to show game starting
			document.getElementById('game-status').textContent = 'Game starting - you are playing as BLACK';
			document.getElementById('waiting-modal').style.display = 'none';

			// Initialize game as black
			initializeWithColor('black');
		});

		// Listen for opponent joined (for the player who created the game)
		MetachessSocket.on('opponent_joined', () => {
			console.log('Opponent joined the game');

			// Clear the waiting modal
			document.getElementById('multiplayer-modal').style.display = 'none';
			document.getElementById('waiting-modal').style.display = 'none';

			// Show a prominent notification
			const notification = document.createElement('div');
			notification.className = 'opponent-joined-notification';
			notification.innerHTML = `
				<div class="notification-content">
					<h3>Opponent Connected!</h3>
					<p>Game starting - you are playing as WHITE</p>
				</div>
			`;
			document.body.appendChild(notification);

			// Update game status
			document.getElementById('game-status').textContent = 'Game starting - you are playing as WHITE';

			// Flash the board or add some visual indication
			const board = document.getElementById('chessboard');
			board.classList.add('highlight-board');

			// Remove the notification and highlight after a few seconds
			setTimeout(() => {
				notification.style.opacity = '0';
				setTimeout(() => notification.remove(), 500);
				board.classList.remove('highlight-board');
			}, 3000);

			// Enable controls if it's your turn
			togglePlayerControls();
		});

		// Listen for opponent's move
		MetachessSocket.on('opponent_move', (data) => {
			console.log('Opponent made a move:', data);

			// Apply the actual move to the board
			const moveData = data.move;
			const move = chess.move({
				from: moveData.from,
				to: moveData.to,
				promotion: moveData.promotion
			});

			if (move) {
				// Update board display
				board.position(chess.fen());
			}

			// Update deck counts
			whiteDeck = Array(data.whiteDeck).fill('?');
			blackDeck = Array(data.blackDeck).fill('?');

			// Update hands directly from server data
			whiteHand = data.whiteHand;
			blackHand = data.blackHand;

			// Update current turn
			currentTurn = data.currentTurn;

			// Update UI
			updateDecks();
			updateHands();
			togglePlayerControls();

			// Check game status
			checkGameStatus();
		});

		// When receiving game state updates
		MetachessSocket.on('hand_update', (data) => {
			console.log('Received hand update:', data);

			// Update deck counts
			whiteDeck = Array(data.whiteDeck).fill('?'); // Just track the count
			blackDeck = Array(data.blackDeck).fill('?');

			// Update hands directly from server data
			whiteHand = data.whiteHand;
			blackHand = data.blackHand;

			// Update current turn if provided
			if (data.currentTurn) {
				currentTurn = data.currentTurn;
			}

			// Update UI
			updateDecks();
			updateHands();
			togglePlayerControls();
		});

		// Listen for opponent disconnected
		MetachessSocket.on('opponent_disconnected', () => {
			console.log('Opponent disconnected');
			document.getElementById('game-status').textContent = 'Opponent disconnected!';
			gameOver = true;
			disableAllControls();
		});

		// Listen for errors
		MetachessSocket.on('error', (data) => {
			console.error('Socket error:', data.message);
			document.getElementById('status-message').textContent = data.message;
		});
	}

	function showMultiplayerOptions() {
		// Create new game option
		const createGameBtn = document.getElementById('create-game-btn');

		createGameBtn.addEventListener('click', () => {
			console.log('Create game button clicked');
			MetachessSocket.createGame();
		});

		// Show multiplayer modal
		document.getElementById('multiplayer-modal').style.display = 'flex';
		console.log('Set multiplayer modal display to flex');
	}

	function initializeWithColor(playerColor) {
		// Initialize game state for specific color
		currentTurn = 'white'; // Game always starts with white

		// Determine which hand is controlled by the player
		playerHand = playerColor === 'white' ? whiteHand : blackHand;
		opponentHand = playerColor === 'white' ? blackHand : whiteHand;

		// Update controls based on whose turn it is
		togglePlayerControls();
	}

	function applyOpponentMove(moveData) {
		// Extract move data
		const { from, to, promotion, pieceType, handIndex } = moveData;

		// Remove card from opponent's hand
		const opponentCardIndex = handIndex;
		removeCardFromOpponentHand(opponentCardIndex);

		// Make the move on the chess board
		const move = chess.move({
			from: from,
			to: to,
			promotion: promotion
		});

		if (move) {
			// Update board display
			board.position(chess.fen());

			// Check game status
			checkGameStatus();

			// Switch turn if game not over
			if (!gameOver) {
				switchTurn();
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
		document.getElementById('white-redraw').disabled = true;
		document.getElementById('white-pass').disabled = true;
		document.getElementById('black-redraw').disabled = true;
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

	return {
		init,
		redrawHand,
		passTurn,
		initMultiplayer
	};
})();