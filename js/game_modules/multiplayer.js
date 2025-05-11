export function initMultiplayer({
	MetachessSocket,
	setupSocketListeners,
	showMultiplayerOptions,
	updateStatusMessage
}) {
	// Initialize socket connection and return the promise
	return MetachessSocket.init()
		.then(success => {
			if (success) {
				console.log('Socket connection successful, ready for multiplayer');
				setupSocketListeners(); // This now calls our wrapper function

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

export function handlePassInMultiplayer({ playerColor, currentTurn, MetachessSocket, updateStatusMessage, disableAllControls }) {
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

export function storeGameSession(gameId, playerColor) {
	try {
		// Generate a unique player ID if one doesn't exist
		let playerId = localStorage.getItem('metachess_player_id');
		if (!playerId) {
			playerId = 'player_' + Math.random().toString(36).substring(2, 15);
			localStorage.setItem('metachess_player_id', playerId);
		}

		// Store the current game info
		const gameSession = {
			gameId,
			playerColor,
			timestamp: Date.now(),
			playerId
		};
		localStorage.setItem('metachess_active_game', JSON.stringify(gameSession));
		console.log('Game session stored', gameSession);

		return playerId;
	} catch (e) {
		console.error('Failed to store game session:', e);
		return null;
	}
}

export function clearGameSession() {
	localStorage.removeItem('metachess_active_game');
}

export function getStoredGameSession() {
	try {
		const sessionData = localStorage.getItem('metachess_active_game');
		return sessionData ? JSON.parse(sessionData) : null;
	} catch (e) {
		console.error('Failed to retrieve game session:', e);
		return null;
	}
}
