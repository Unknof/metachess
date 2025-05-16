import { MetachessGame } from './game.js';
import { MetachessSocket } from './socket.js';
import * as Multiplayer from './game_modules/multiplayer.js';



console.log('App version running on port: ' + window.location.port);

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', function () {
	console.log('MetaChess app initialized');
	console.log('DOM Content Loaded - Starting to attach event handlers');

	// Initialize the chessboard
	const { chess, board } = MetachessBoard.init('chessboard');

	MetachessSocket.setChessInstance(chess);
	MetachessGame.init(chess, board);

	// Copy game link button
	document.getElementById('copy-link').addEventListener('click', function () {
		const linkInput = document.getElementById('game-link');
		linkInput.select();
		document.execCommand('copy');
		this.textContent = 'Copied!';
		setTimeout(() => { this.textContent = 'Copy Link'; }, 2000);
	});

	// Modal handling
	document.getElementById('cancel-multiplayer').onclick = function () {
		document.getElementById('multiplayer-modal').style.display = 'none';
	};

	document.getElementById('cancel-waiting').onclick = function () {
		document.getElementById('waiting-modal').style.display = 'none';
	};

	// Replace your existing multiplayer button code with this
	const multiplayerBtn = document.getElementById('multiplayer-btn');
	if (multiplayerBtn) {
		// Remove any existing event listeners
		multiplayerBtn.replaceWith(multiplayerBtn.cloneNode(true));

		// Get the fresh element and add listener
		const freshBtn = document.getElementById('multiplayer-btn');
		freshBtn.addEventListener('click', function (e) {
			e.preventDefault();
			//console.log('Multiplayer button clicked - forcing display');

			// Force display style directly
			const modal = document.getElementById('multiplayer-modal');
			modal.style.display = 'flex';
			modal.style.opacity = '1';
			modal.style.visibility = 'visible';

			//console.log('Modal style set to:', modal.style.display);
		});
	}

	// Update your existing create game button handler
	const createGameBtn = document.getElementById('create-game-btn');
	if (createGameBtn) {
		createGameBtn.addEventListener('click', function (e) {
			e.preventDefault();
			Multiplayer.clearGameSession();
			document.getElementById('multiplayer-modal').style.display = 'none';
			MetachessGame.createMultiplayer()
				.then(() => {
					setTimeout(() => {
						MetachessSocket.createGame();
					}, 500);
				})
				.catch(err => {
					console.error('Failed to initialize multiplayer:', err);
					document.getElementById('status-message').textContent = 'Failed to create game. Please try again.';
				});
		});
	}

	const joinGameBtn = document.getElementById('join-game-btn');
	joinGameBtn.addEventListener('click', function () {
		const gameId = document.getElementById('game-id-input').value.trim();
		if (gameId) {
			MetachessGame.joinMultiplayer({ gameId });
		}
	});

	const urlParams = new URLSearchParams(window.location.search);
	const urlGameId = urlParams.get('game');
	const storedSession = Multiplayer.getStoredGameSession();

	if (storedSession || urlGameId) {
		console.log('Attempting to join multiplayer game with urlGameId:', urlGameId, ' and storedSession ', storedSession);
		MetachessGame.joinMultiplayer({ storedSession, urlGameId });
	} else {
		console.log('No multiplayer session or gameId in URL. Showing main menu.');
		// Optionally show a message or main menu here
	}

	const menuButton = document.getElementById('menu-button');
	if (menuButton) {
		menuButton.addEventListener('click', function () {
			document.getElementById('game-options-modal').style.display = 'flex';
		});
	}

	document.querySelectorAll('.close-modal').forEach(button => {
		button.addEventListener('click', function () {
			document.getElementById('game-options-modal').style.display = 'none';
			document.getElementById('concede-confirm-modal').style.display = 'none';
		});
	});

	const newGameBtn = document.getElementById('new-game-btn');
	if (newGameBtn) {
		newGameBtn.addEventListener('click', function () {
			document.getElementById('game-options-modal').style.display = 'none';
			MetachessGame.resetGame();
		});
	}

	const concedeButton = document.getElementById('concede-button');
	if (concedeButton) {
		concedeButton.addEventListener('click', function () {
			document.getElementById('game-options-modal').style.display = 'none';
			document.getElementById('concede-confirm-modal').style.display = 'flex';
		});
	}

	const confirmConcede = document.getElementById('confirm-concede');
	if (confirmConcede) {
		confirmConcede.addEventListener('click', function () {
			document.getElementById('concede-confirm-modal').style.display = 'none';
			// Determine the conceding player
			const concedingPlayer = MetachessGame.getCurrentTurn ? MetachessGame.getCurrentTurn() : 'white';
			MetachessGame.gameOverWin(concedingPlayer, 'resignation');
			// Optionally notify opponent if multiplayer
			// (You may need to expose MetachessSocket and playerColor if needed)
		});
	}

	const cancelConcede = document.getElementById('cancel-concede');
	if (cancelConcede) {
		cancelConcede.addEventListener('click', function () {
			document.getElementById('concede-confirm-modal').style.display = 'none';
		});
	}

	window.addEventListener('click', function (event) {
		const gameOptionsModal = document.getElementById('game-options-modal');
		const concedeConfirmModal = document.getElementById('concede-confirm-modal');
		if (event.target === gameOptionsModal) {
			gameOptionsModal.style.display = 'none';
		}
		if (event.target === concedeConfirmModal) {
			concedeConfirmModal.style.display = 'none';
		}
	});

	// Make sure both modals are hidden when an opponent joins
	const originalInitMultiplayer = MetachessGame.initMultiplayer;
	MetachessGame.initMultiplayer = function () {
		// Call the original
		const result = originalInitMultiplayer.apply(this, arguments);

		// Add null checking before accessing elements
		MetachessSocket.on('opponent_joined', () => {
			const multiplayerModal = document.getElementById('multiplayer-modal');
			const waitingModal = document.getElementById('waiting-modal');
			const menuButton = document.getElementById('menu-button');

			if (multiplayerModal) multiplayerModal.style.display = 'none';
			if (waitingModal) waitingModal.style.display = 'none';
			if (menuButton) menuButton.style.display = 'none';
		});

		return result;
	};

	// Add this at the end of your DOMContentLoaded function
	document.addEventListener('click', function (event) {
		console.log('Document click detected on:', event.target);

		// Check if click was on or inside one of our buttons
		if (event.target.id === 'cancel-multiplayer' ||
			event.target.id === 'cancel-waiting' ||
			event.target.closest('#cancel-multiplayer') ||
			event.target.closest('#cancel-waiting')) {
			// Button handling code
		}

		// Check if any modals are currently visible - DEFENSIVE CODE
		const multiplayerModal = document.getElementById('multiplayer-modal');
		const waitingModal = document.getElementById('waiting-modal');

		// Only access style if elements exist
		if (multiplayerModal) {
			const multiplayerModalStyle = window.getComputedStyle(multiplayerModal);
			// Rest of the code using multiplayerModalStyle
		}

		if (waitingModal) {
			const waitingModalStyle = window.getComputedStyle(waitingModal);
			// Rest of the code using waitingModalStyle
		}
	});

	console.log('Checking for CSS conflicts');

});