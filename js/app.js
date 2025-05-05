// Main application entry point

console.log('App version running on port: ' + window.location.port);

document.addEventListener('DOMContentLoaded', function () {
	console.log('MetaChess app initialized');
	console.log('DOM Content Loaded - Starting to attach event handlers');

	// Initialize the chessboard
	const { chess, board } = MetachessBoard.init('chessboard');

	// Initialize game with the chess and board instances
	MetachessGame.init(chess, board);

	// Add event listeners for controls
	document.getElementById('white-redraw').addEventListener('click', MetachessGame.redrawHand);
	document.getElementById('white-pass').addEventListener('click', MetachessGame.passTurn);
	document.getElementById('black-redraw').addEventListener('click', MetachessGame.redrawHand);
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

	// Initialize multiplayer functionality
	const multiplayerBtn = document.getElementById('multiplayer-btn');
	if (multiplayerBtn) {
		multiplayerBtn.addEventListener('click', () => {
			MetachessGame.initMultiplayer();
		});
	} else {
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
			console.log('Click was on or inside a cancel button');
		}

		// Check if any modals are currently visible
		const multiplayerModalStyle = window.getComputedStyle(document.getElementById('multiplayer-modal'));
		const waitingModalStyle = window.getComputedStyle(document.getElementById('waiting-modal'));

		console.log('Multiplayer modal computed display:', multiplayerModalStyle.display);
		console.log('Waiting modal computed display:', waitingModalStyle.display);
	});

	console.log('Checking for CSS conflicts');

	// Add a test button outside any modal to see if normal buttons work
	const testButton = document.createElement('button');
	testButton.textContent = 'Test Button';
	testButton.style.position = 'fixed';
	testButton.style.top = '10px';
	testButton.style.right = '10px';
	testButton.style.zIndex = '2000';

	testButton.addEventListener('click', function () {
		console.log('Test button clicked successfully');
		alert('Test button works!');
	});

	document.body.appendChild(testButton);

	// Add a debug button to show connection info
	const debugBtn = document.createElement('button');
	debugBtn.textContent = 'Debug Info';
	debugBtn.style.position = 'fixed';
	debugBtn.style.bottom = '10px';
	debugBtn.style.right = '10px';
	debugBtn.style.zIndex = '9999';

	debugBtn.addEventListener('click', function () {
		const socketInfo = MetachessSocket.getConnectionInfo();
		const debugInfo = `
			Connected: ${socketInfo.connected}
			Game ID: ${socketInfo.gameId || 'None'}
			Player Color: ${socketInfo.playerColor || 'None'}
			
			Server URL: ${location.origin}
			Current URL: ${location.href}
		`;
		alert(debugInfo);
	});

	document.body.appendChild(debugBtn);
});