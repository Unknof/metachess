import { MetachessGame } from './game.js';
import { MetachessSocket } from './socket.js';
import * as Multiplayer from './game_modules/multiplayer.js';
import { setChessAndBoard } from './game.js';
import { Auth } from './auth.js';


console.log('App version running on port: ' + window.location.port);

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', function () {
	console.log('MetaChess app initialized');
	//console.log('DOM Content Loaded - Starting to attach event handlers');
	const mainMenuLanding = document.getElementById('main-menu-landing');
	if (mainMenuLanding) {
		mainMenuLanding.style.display = 'flex';
	}

	const versusBtn = document.getElementById('main-menu-versus');
	if (versusBtn) {
		versusBtn.addEventListener('click', function () {
			if (mainMenuLanding) mainMenuLanding.style.display = 'none';
			Multiplayer.clearGameSession();
			document.getElementById('multiplayer-modal').style.display = 'none';
			MetachessGame.createMultiplayer()
				.then(() => {
					// Request a new gameId from the server (server creates empty game slot)
					MetachessSocket.requestNewGame();
				})
				.catch(err => {
					console.error('Failed to initialize multiplayer:', err);
					document.getElementById('status-message').textContent = 'Failed to create game. Please try again.';
				});
		});
	}

	function getDeckFromEditor() {
		const pieceIds = ['p', 'n', 'b', 'r', 'q', 'k'];
		const counts = {};
		let valid = true;

		// Collect and validate all piece counts
		pieceIds.forEach(id => {
			const val = parseInt(document.getElementById(`deck-${id}`).value, 10);
			if (isNaN(val) || val < 1 || val > 99) {
				valid = false;
			}
			counts[id] = val;
		});

		if (!valid) return null;

		// Build deck array efficiently
		return pieceIds.flatMap(id => Array(counts[id]).fill(id));
	}
	// Settings and Profile buttons: placeholder handlers
	const settingsBtn = document.getElementById('main-menu-settings');
	if (settingsBtn) {
		settingsBtn.addEventListener('click', async function () {
			if (!Auth.isLoggedIn()) {
				alert('You must be logged in to edit your deck.');
				return;
			}
			const playerId = Auth.getCurrentUser().playerId;
			try {
				const response = await fetch(`/api/get_deck?playerId=${encodeURIComponent(playerId)}`);
				if (response.ok) {
					const data = await response.json();
					// Count pieces
					const counts = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
					data.deck.forEach(piece => {
						const key = piece.toLowerCase();
						if (counts.hasOwnProperty(key)) counts[key]++;
					});
					document.getElementById('deck-p').value = counts.p;
					document.getElementById('deck-n').value = counts.n;
					document.getElementById('deck-b').value = counts.b;
					document.getElementById('deck-r').value = counts.r;
					document.getElementById('deck-q').value = counts.q;
					document.getElementById('deck-k').value = counts.k;
				} else {
					// No deck found, use defaults
					document.getElementById('deck-p').value = 8;
					document.getElementById('deck-n').value = 2;
					document.getElementById('deck-b').value = 2;
					document.getElementById('deck-r').value = 2;
					document.getElementById('deck-q').value = 1;
					document.getElementById('deck-k').value = 1;
				}
			} catch (err) {
				// On error, use defaults
				document.getElementById('deck-p').value = 8;
				document.getElementById('deck-n').value = 2;
				document.getElementById('deck-b').value = 2;
				document.getElementById('deck-r').value = 2;
				document.getElementById('deck-q').value = 1;
				document.getElementById('deck-k').value = 1;
			}
			document.getElementById('deck-editor-modal').style.display = 'flex';
		});
	}

	// On save button in deck editor modal:
	document.getElementById('save-deck-btn').addEventListener('click', async function () {
		const deck = getDeckFromEditor(); // Implement this to read the deck from your UI
		const playerId = Auth.getCurrentUser().playerId;
		const response = await fetch('/api/save_deck', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerId, deck })
		});
		const result = await response.json();
		alert(result.message || result.error);
	});

	document.getElementById('deck-editor-form').addEventListener('submit', async function (e) {
		e.preventDefault();
		const deck = getDeckFromEditor();
		const messageDiv = document.getElementById('deck-save-message');
		if (!deck) {
			messageDiv.textContent = 'All values must be between 1 and 99.';
			messageDiv.style.color = 'red';
			return;
		}
		const playerId = Auth.getCurrentUser().playerId;
		const response = await fetch('/api/save_deck', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerId, deck })
		});
		const result = await response.json();
		messageDiv.textContent = result.message || result.error;
		messageDiv.style.color = result.message ? 'green' : 'red';
	});
	// Initialize the chessboard
	const { chess, board } = MetachessBoard.init('chessboard');
	setChessAndBoard({ chess, board });

	MetachessSocket.setChessInstance(chess);

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
			//document.getElementById('menu-button').style.display = 'none';
			document.getElementById('game-options-modal').style.display = 'none';
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
					// Request a new gameId from the server (server creates empty game slot)
					MetachessSocket.requestNewGame();
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

	async function tryJoinMultiplayer() {
		let joined = false;
		if (storedSession || urlGameId) {
			console.log('Attempting to connect to multiplayer game with urlGameId:', urlGameId, ' and storedSession ', storedSession);
			if (mainMenuLanding) mainMenuLanding.style.display = 'none';
			joined = await MetachessGame.joinMultiplayer({ storedSession, urlGameId });
		}
		if (!joined) {
			console.log('No multiplayer session or gameId in URL or join failed. Showing main menu.');
			if (mainMenuLanding) mainMenuLanding.style.display = 'flex';
		}
	}

	tryJoinMultiplayer();



	const rematchBtn = document.getElementById('rematch-btn');
	if (rematchBtn) {
		rematchBtn.addEventListener('click', function () {
			if (!rematchBtn.disabled) {
				MetachessSocket.sendRematchOffer({
					gameId: MetachessSocket.gameId,
					player: MetachessSocket.playerColor
				});
				// Show "rematch offer pending" modal
				document.getElementById('rematch-pending-modal').style.display = 'flex';
			}
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

			// If in multiplayer, send resign message to server
			if (MetachessSocket && MetachessSocket.isConnected() && MetachessSocket.gameId) {
				MetachessSocket.sendResign && MetachessSocket.sendResign({
					gameId: MetachessSocket.gameId,
					player: concedingPlayer
				});
			} else {
				// Local game: just end locally
				MetachessGame.gameOverWin(concedingPlayer, 'resignation');
			}
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

	document.getElementById('pass-turn').addEventListener('click', function () {
		MetachessGame.passTurn();
	});

	// Deck composition modal toggle logic
	const deckBtn = document.getElementById('player-deck-count-btn');
	const deckModal = document.getElementById('deck-composition-modal');
	const deckModalBody = document.getElementById('deck-composition-body');
	const closeDeckModal = document.getElementById('close-deck-modal');

	let deckModalVisible = false;

	function renderDeckComposition() {
		const composition = (typeof MetachessGame.getDeckComposition === 'function')
			? MetachessGame.getDeckComposition()
			: null;

		if (!composition) {
			deckModalBody.innerHTML = '<p>Deck composition not available.</p>';
			return;
		}

		deckModalBody.innerHTML = `
        <table style="margin:0 auto;">
            <tr><th>Piece</th><th>Count</th></tr>
            <tr><td>Pawn</td><td>${composition.p || 0}</td></tr>
            <tr><td>Knight</td><td>${composition.n || 0}</td></tr>
            <tr><td>Bishop</td><td>${composition.b || 0}</td></tr>
            <tr><td>Rook</td><td>${composition.r || 0}</td></tr>
            <tr><td>Queen</td><td>${composition.q || 0}</td></tr>
            <tr><td>King</td><td>${composition.k || 0}</td></tr>
        </table>
    `;
	}

	function toggleDeckModal() {
		deckModalVisible = !deckModalVisible;
		if (deckModalVisible) {
			renderDeckComposition();
			deckModal.style.display = 'flex';
		} else {
			deckModal.style.display = 'none';
		}
	}

	// Make the deck button clickable (just like pass-turn)
	if (deckBtn) {
		deckBtn.addEventListener('click', toggleDeckModal);
	}
	if (closeDeckModal) {
		closeDeckModal.addEventListener('click', toggleDeckModal);
	}
	if (deckModal) {
		deckModal.addEventListener('click', function (e) {
			if (e.target === deckModal) toggleDeckModal();
		});
	}
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

	Auth.init();

	// Update profile button handler
	const profileBtn = document.getElementById('main-menu-profile');
	if (profileBtn) {
		profileBtn.addEventListener('click', function () {
			if (Auth.isLoggedIn()) {
				// Show user menu (you can expand this later)
				const user = Auth.getCurrentUser();
				alert(`Logged in as: ${user.username}\n\nClick OK to logout`);
				Auth.logout();
			} else {
				// Show login modal
				document.getElementById('login-modal').style.display = 'flex';
			}
		});
	}

	// Login form handler
	document.getElementById('login-form-element').addEventListener('submit', async function (e) {
		e.preventDefault();
		const email = document.getElementById('login-email').value;
		const password = document.getElementById('login-password').value;

		const result = await Auth.login(email, password);
		const messageDiv = document.getElementById('auth-message');

		if (result.success) {
			messageDiv.textContent = 'Login successful!';
			messageDiv.style.color = 'green';
			setTimeout(() => {
				document.getElementById('login-modal').style.display = 'none';
				messageDiv.textContent = '';
			}, 1000);
		} else {
			messageDiv.textContent = result.error;
			messageDiv.style.color = 'red';
		}
	});

	// Register form handler
	document.getElementById('register-form-element').addEventListener('submit', async function (e) {
		e.preventDefault();
		const username = document.getElementById('register-username').value;
		const email = document.getElementById('register-email').value;
		const password = document.getElementById('register-password').value;

		const result = await Auth.register(username, email, password);
		const messageDiv = document.getElementById('auth-message');

		if (result.success) {
			messageDiv.textContent = 'Registration and login successful!';
			messageDiv.style.color = 'green';
			setTimeout(() => {
				document.getElementById('login-modal').style.display = 'none';
				messageDiv.textContent = '';
			}, 1000);
		} else {
			messageDiv.textContent = result.error;
			messageDiv.style.color = 'red';
		}
	});

	// Toggle between login and register forms
	document.getElementById('show-register').addEventListener('click', function (e) {
		e.preventDefault();
		document.getElementById('login-form').style.display = 'none';
		document.getElementById('register-form').style.display = 'block';
	});

	document.getElementById('show-login').addEventListener('click', function (e) {
		e.preventDefault();
		document.getElementById('register-form').style.display = 'none';
		document.getElementById('login-form').style.display = 'block';
	});
});