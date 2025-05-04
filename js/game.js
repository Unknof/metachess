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
	let engineInitialized = false;

	function init(chessInstance, boardInstance) {
		chess = chessInstance;
		board = boardInstance;

		console.log("Initializing game...");

		// Initialize decks
		whiteDeck = MetachessDeck.createDeck();
		blackDeck = MetachessDeck.createDeck();

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

		// Re-render both hands - explicitly set active status based on current turn
		MetachessDeck.renderCards(whiteHand, 'white-cards', 'white', currentTurn === 'white');
		MetachessDeck.renderCards(blackHand, 'black-cards', 'black', currentTurn === 'black');

		// Add event listeners to current player's cards
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
		console.log('Selected piece type:', pieceType, 'at index:', index);

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

			MetachessEngine.getBestMoveForPieceType(chess.fen(), pieceType)
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
		currentTurn = currentTurn === 'white' ? 'black' : 'white';
		console.log("Switched turn to:", currentTurn);
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

	return {
		init,
		redrawHand,
		passTurn
	};
})();