/**
 * Socket event listeners for MetaChess multiplayer functionality
 */

import { MetachessGame, setChessAndBoard } from '../game.js';
import { getChess, getBoard } from '../game.js';

export function setupSocketListeners({
	// Network
	MetachessSocket,

	// Game state variables
	playerColor,
	whiteDeck,
	whiteHand,
	blackDeck,
	blackHand,
	timeControl,
	currentTurn,

	// Functions needed
	applyOpponentMove,
	updateStatusMessage,
	disableAllControls,
	initializeWithColor,
	synchronizeGameState,
	togglePlayerControls,
	updateClockDisplay,
	showPassIndicator,
	gameOverWin,
	updateBoardBorder,
	handleMultiplayerRedraw,
	checkForValidMoves,
	startClock,
	highlightKingInCheck,
	updateCardsUI,
}) {
	let board = getBoard();

	function updateDeckAndHandFromServer(data) {
		// Update decks
		whiteDeck = Array.isArray(data.whiteDeck) ? data.whiteDeck : Array(data.whiteDeck).fill('?');
		blackDeck = Array.isArray(data.blackDeck) ? data.blackDeck : Array(data.blackDeck).fill('?');

		whiteHand = data.whiteHand || [];
		MetachessGame.setWhiteHand(Array.isArray(data.whiteHand) ? data.whiteHand : []);
		updateCardsUI(whiteHand, whiteDeck, 'white');

		blackHand = data.blackHand || [];
		MetachessGame.setBlackHand(Array.isArray(data.blackHand) ? data.blackHand : []);
		updateCardsUI(blackHand, blackDeck, 'black');



		currentTurn = data.currentTurn;
		if (data.deckComposition) {
			MetachessGame.setDeckComposition(data.deckComposition);
		}
	}
	// Listen for game created event
	MetachessSocket.on('game_created', (data) => {
		MetachessGame.multiplayerInit(getChess(), board, data);
		const newUrl = new URL(window.location);
		newUrl.searchParams.set('game', data.gameId);
		window.history.pushState({}, '', newUrl);

		console.log('Game created:', data);
		MetachessSocket.setGameInfo(data.gameId, data.playerColor);
		playerColor = data.playerColor;  // This is important - set playerColor immediately

		updateDeckAndHandFromServer(data);

		// Update UI to show waiting for opponent
		updateStatusMessage('Waiting for opponent to join...');
		document.getElementById('game-link').value = `${window.location.href}`;
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

		updateDeckAndHandFromServer(data);


	});

	// ADD THIS HANDLER for game_joined event
	MetachessSocket.on('game_joined', (data) => {
		console.log('Game joined:', data);

		// Set game ID and player color
		MetachessGame.multiplayerInit(getChess(), board, data);
		MetachessSocket.setGameInfo(data.gameId, data.playerColor);
		playerColor = data.playerColor;

		const newUrl = new URL(window.location);
		newUrl.searchParams.set('game', data.gameId);
		window.history.pushState({}, '', newUrl);

		// Clear any open modals
		document.getElementById('multiplayer-modal').style.display = 'none';
		document.getElementById('waiting-modal').style.display = 'none';

		// Set initial deck and hand state
		whiteDeck = Array.isArray(data.whiteDeck) ? data.whiteDeck : Array(data.whiteDeck).fill('?');
		blackDeck = Array.isArray(data.blackDeck) ? data.blackDeck : Array(data.blackDeck).fill('?');

		// Update hands based on player color
		if (playerColor === 'white') {
			whiteHand = data.whiteHand;
		} else {
			blackHand = data.blackHand;
		}

		// Initialize with player color
		initializeWithColor(playerColor);

		updateDeckAndHandFromServer(data);



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
		whiteDeck = Array.isArray(data.whiteDeck) ? data.whiteDeck : Array(data.whiteDeck).fill('?');
		blackDeck = Array.isArray(data.blackDeck) ? data.blackDeck : Array(data.blackDeck).fill('?');

		// Update time control if provided
		if (data.timeControl) {
			timeControl.white = data.timeControl.white;
			timeControl.black = data.timeControl.black;

			// Start clock if it hasn't been started yet
			if (!timeControl.started) startClock();

			updateClockDisplay();
		}

		// Synchronize with server's game state
		updateDeckAndHandFromServer(data);
		synchronizeGameState(data.currentTurn);



	});

	// Update your pass_update handler
	MetachessSocket.on('pass_update', (data) => {
		//console.log('Pass update received:', data);

		// Update decks and hands
		whiteDeck = Array.isArray(data.whiteDeck) ? data.whiteDeck : Array(data.whiteDeck).fill('?');
		blackDeck = Array.isArray(data.blackDeck) ? data.blackDeck : Array(data.blackDeck).fill('?');

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
		if (data.fen && data.fen !== 'start') {
			console.log('Socketlistener Updating board with FEN after pass:', data.fen);

			getChess().load(data.fen);
			console.log('FEN after getChess().load:', getChess().fen());
		}

		// Synchronize with server's game state
		synchronizeGameState(data.currentTurn);
		updateDeckAndHandFromServer(data);



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
		whiteDeck = Array.isArray(data.whiteDeck) ? data.whiteDeck : Array(data.whiteDeck).fill('?');
		blackDeck = Array.isArray(data.blackDeck) ? data.blackDeck : Array(data.blackDeck).fill('?');

		// Update hands based on player color
		if (playerColor === 'white') {
			whiteHand = data.whiteHand;
		} else if (playerColor === 'black') {
			blackHand = data.blackHand;
		}

		// Synchronize with server's game state
		synchronizeGameState(data.currentTurn);

		updateDeckAndHandFromServer(data);


	});

	// Add this to setupSocketListeners function
	MetachessSocket.on('redraw_update', (data) => {
		console.log('Redraw update received:', data);

		// Update deck counts
		whiteDeck = Array.isArray(data.whiteDeck) ? data.whiteDeck : Array(data.whiteDeck).fill('?');
		blackDeck = Array.isArray(data.blackDeck) ? data.blackDeck : Array(data.blackDeck).fill('?');

		// Update hands based on player color
		if (playerColor === 'white') {
			whiteHand = data.whiteHand;
		} else if (playerColor === 'black') {
			blackHand = data.blackHand;
		}

		// Update UI
		updateDeckAndHandFromServer(data);



		const isCurrentPlayer = data.redrawingPlayer === playerColor;
		const playerText = isCurrentPlayer ? 'You have' : 'Opponent has';

		updateStatusMessage(`${playerText} no valid moves. Redrawing cards...`);

		// If we need to check again (with new hand)
		if (data.needToCheckAgain && isCurrentPlayer) {
			// Give a slight delay for UI to update and show the new hand
			setTimeout(() => {
				if (!checkForValidMoves(playerColor)) {
					// Still no valid moves, request another redraw
					handleMultiplayerRedraw();
				} else {
					// We now have valid moves, enable controls
					togglePlayerControls();
					updateStatusMessage("Found a playable card!");
				}
			}, 1000);
		} else if (isCurrentPlayer) {
			togglePlayerControls();
		}
	});

	MetachessSocket.on('game_over', (data) => {
		console.log('Game over notification received:', data);

		// Handle the game over state based on reason
		switch (data.reason) {
			case 'checkmate':
				// Determine the losing player (opposite of winner)
				const losingPlayer = data.winner === 'white' ? 'black' : 'white';
				gameOverWin(losingPlayer, 'checkmate');
				break;

			case 'king_capture':
				// Determine the losing player (opposite of winner)
				const loserKC = data.winner === 'white' ? 'black' : 'white';
				gameOverWin(loserKC, 'king_capture');
				break;

			case 'resignation':
				// The player who resigned is already in the data
				gameOverWin(data.loser || (data.winner === 'white' ? 'black' : 'white'), 'resignation');
				break;

			case 'no_valid_moves':
				// The player with no valid moves is the loser
				gameOverWin(data.loser, 'no_cards');
				break;

			case 'time_out':
				// The player who timed out is already identified
				gameOverWin(data.loser, 'time_out');
				break;

			default:
				// Generic game over handling
				const losingDefault = data.winner === 'white' ? 'black' : 'white';
				gameOverWin(losingDefault, data.reason || 'default');
		}
	});

	MetachessSocket.on('time_update', (data) => {
		//console.log('Time update received:', data);

		// Update time control information
		timeControl.white = data.white;
		timeControl.black = data.black;

		// Make sure current turn is in sync with server
		if (currentTurn !== data.currentTurn) {
			currentTurn = data.currentTurn;
			updateBoardBorder();
			togglePlayerControls();
		}

		// Update the clock display
		updateClockDisplay();
	});

	// Add handler for reconnection_successful event
	MetachessSocket.on('reconnection_successful', (data) => {
		MetachessGame.multiplayerInit(getChess(), board, data);
		console.log('[Reconnect] Server successful, currentTurn is:', data.currentTurn);

		MetachessSocket.setGameInfo(data.gameId, data.playerColor);
		playerColor = data.playerColor;

		// Restore deck and hand state
		whiteDeck = Array.isArray(data.whiteDeck) ? data.whiteDeck : Array(data.whiteDeck).fill('?');
		blackDeck = Array.isArray(data.blackDeck) ? data.blackDeck : Array(data.blackDeck).fill('?');

		// Update hands based on player color
		// Update hands based on player color
		if (playerColor === 'white') {
			whiteHand = data.whiteHand || [];
			blackHand = [];
		} else {
			whiteHand = [];
			blackHand = data.blackHand || [];
		}

		console.log('After hand assignment:', { whiteHand, blackHand });

		// Clear any open modals
		document.querySelectorAll('.modal').forEach(modal => {
			modal.style.display = 'none';
		});

		// Set up board with the current FEN
		if (data.fen && data.fen !== 'start') {
			console.log('Socketlistener Updating board with FEN after reconnect:', data.fen);
			getChess().load(data.fen);
		}



		updateStatusMessage(`Reconnected as ${playerColor.toUpperCase()}`);

		// Synchronize game state from server
		currentTurn = data.currentTurn;
		synchronizeGameState(data.currentTurn);

		// Reset board to match FEN
		if (board) {
			board.position(getChess().fen());
		}

		// Initialize with player color to set up pieces correctly
		initializeWithColor(playerColor);

		// Setup time control
		if (data.timeControl) {
			Object.assign(timeControl, data.timeControl);
			timeControl.started = true;
			updateClockDisplay();
		}

		// Enable or disable controls based on turn
		togglePlayerControls();


		updateDeckAndHandFromServer(data);

		// Update board border to show current turn
		updateBoardBorder(currentTurn);

		// Check if king is in check
		highlightKingInCheck();
	});

	MetachessSocket.on('error', (data) => {
		if (data.message && data.message.includes('Game no longer exists')) {
			console.log("Clearing stale game session from localStorage");
			localStorage.removeItem('metachess_active_game');


			updateStatusMessage('');
		}
		// ...other error handling...
	});

	return {
		// Return pointers to updated state variables
		playerColor,
		whiteDeck,
		whiteHand,
		blackDeck,
		blackHand,
		timeControl,
		currentTurn
	};
}