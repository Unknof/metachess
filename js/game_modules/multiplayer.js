function resetGameUrl() {
	const url = new URL(window.location);
	url.searchParams.delete('game');
	window.history.replaceState({}, '', url.pathname + url.search);
}

export async function createMultiplayer({
	MetachessSocket,
	setupSocketListeners,
	updateStatusMessage
}) {
	const success = await MetachessSocket.init();
	if (!success) {
		updateStatusMessage('No socket connection. Playing in single-player mode.');
		resetGameUrl();
		return false;
	}
	setupSocketListeners();
	// The actual game creation will be triggered by the client after this resolves
	return true;
}

export async function joinMultiplayer({
	MetachessSocket,
	setupSocketListeners,
	updateStatusMessage,
	storedSession,
	urlGameId
}) {
	const success = await MetachessSocket.init();
	if (!success) {
		updateStatusMessage('No socket connection. Playing in single-player mode.');
		resetGameUrl();
		return false;
	}
	setupSocketListeners();

	const checkGame = (gameId) => {
		return new Promise(resolve => {
			const handler = (result) => {
				MetachessSocket.off('check_game_result', handler);
				resolve(result);
			};
			MetachessSocket.on('check_game_result', handler);
			MetachessSocket.sendCheckGame(gameId);
		});
	};

	// Prefer stored session first
	if (storedSession && storedSession.gameId) {
		const result = await checkGame(storedSession.gameId);
		if (result && result.exists) {
			await MetachessSocket.reconnectToGame(storedSession.gameId, storedSession.playerColor);
			updateStatusMessage('Reconnected to your game!');
			return true;
		}
	}

	// Only check URL gameId if it's different from storedSession.gameId
	if (urlGameId && (!storedSession || urlGameId !== storedSession.gameId)) {
		const result = await checkGame(urlGameId);
		if (result && result.exists) {
			if (result.started) {
				await MetachessSocket.reconnectToGame(urlGameId);
				updateStatusMessage('Reconnected to your game!');
				return true;
			} else {
				await MetachessSocket.joinGame(urlGameId);
				updateStatusMessage('Joined game!');
				return true;
			}
		}
	}

	console.log('Multiplayer unavailable. Playing in single-player mode.');
	resetGameUrl();
	return false;
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
