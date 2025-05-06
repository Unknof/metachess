// Main application entry point

console.log('App version running on port: ' + window.location.port);

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', function () {
	console.log('MetaChess app initialized');
	console.log('DOM Content Loaded - Starting to attach event handlers');

	// Initialize the chessboard
	const { chess, board } = MetachessBoard.init('chessboard');

	// Initialize game with the chess and board instances
	MetachessGame.init(chess, board);

	// Add event listeners for controls
	document.getElementById('white-pass').addEventListener('click', MetachessGame.passTurn);
	document.getElementById('black-pass').addEventListener('click', MetachessGame.passTurn);

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
		// Remove any existing event listeners to avoid duplicates
		createGameBtn.replaceWith(createGameBtn.cloneNode(true));

		// Get the fresh element and add listener
		const freshCreateBtn = document.getElementById('create-game-btn');
		freshCreateBtn.addEventListener('click', function (e) {
			e.preventDefault();
			//console.log('Create game button clicked - initiating multiplayer setup');

			// Hide the multiplayer modal
			document.getElementById('multiplayer-modal').style.display = 'none';

			// Initialize multiplayer and create game
			MetachessGame.initMultiplayer()
				.then(() => {
					// Short delay to ensure socket is properly connected
					setTimeout(() => {
						console.log('Creating new game via socket');
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
	if (joinGameBtn) {
		joinGameBtn.addEventListener('click', function () {
			const gameId = document.getElementById('game-id-input').value.trim();
			if (gameId) {
				MetachessGame.initMultiplayer().then(() => {
					setTimeout(() => {
						MetachessSocket.joinGame(gameId);
					}, 500);
				});
			}
		});
	}

	// Check if we have a game ID in the URL
	const urlParams = new URLSearchParams(window.location.search);
	const gameId = urlParams.get('game');
	const multiplayerMode = urlParams.get('multiplayer');

	if (gameId || multiplayerMode === 'true') {
		// We're joining a game or explicitly requesting multiplayer mode
		MetachessGame.initMultiplayer();
	} else {
		// Default to single player mode
		document.getElementById('game-status').textContent = 'Single Player Mode';
	}

	// Make sure both modals are hidden when an opponent joins
	const originalInitMultiplayer = MetachessGame.initMultiplayer;
	MetachessGame.initMultiplayer = function () {
		// Call the original
		const result = originalInitMultiplayer.apply(this, arguments);

		// Add additional code to ensure both modals are hidden when opponent_joined fires
		MetachessSocket.on('opponent_joined', () => {
			document.getElementById('multiplayer-modal').style.display = 'none';
			document.getElementById('waiting-modal').style.display = 'none';
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

		}

		// Check if any modals are currently visible
		const multiplayerModalStyle = window.getComputedStyle(document.getElementById('multiplayer-modal'));
		const waitingModalStyle = window.getComputedStyle(document.getElementById('waiting-modal'));

	});

	console.log('Checking for CSS conflicts');

	// Debug function to check modal state
	function checkModalState() {
		const multiplayerModal = document.getElementById('multiplayer-modal');
		const waitingModal = document.getElementById('waiting-modal');
	}
});