// WebSocket handling for multiplayer functionality
const MetachessSocket = (function () {
	let socket = null;
	let gameId = null;
	let playerColor = null;
	let callbacks = {};

	function init(serverUrl = window.location.hostname === 'localhost' ?
		'ws://localhost:8080' :
		`wss://${window.location.host}`) {
		return new Promise((resolve, reject) => {
			try {
				// Close existing socket if it exists
				if (socket) {
					socket.close();
				}

				console.log('Connecting to WebSocket server at:', serverUrl);
				socket = new WebSocket(serverUrl);

				// Add connection timeout
				const connectionTimeout = setTimeout(() => {
					if (socket && socket.readyState !== WebSocket.OPEN) {
						console.error('WebSocket connection timeout');
						reject(new Error('Connection timeout'));
					}
				}, 5000);

				socket.onopen = () => {
					console.log('WebSocket connection established');
					clearTimeout(connectionTimeout);
					const connectionStatus = document.getElementById('connection-status');
					if (connectionStatus) {
						connectionStatus.textContent = 'Connected';
						connectionStatus.className = 'connection-status connected';
					}
					startHeartbeat();
					resolve(true);
				};

				socket.onmessage = (event) => {
					const data = JSON.parse(event.data);
					console.log('Message received:', data);

					if (callbacks[data.type]) {
						callbacks[data.type](data);
					}
				};

				socket.onerror = (error) => {
					console.error('WebSocket error:', error);
					reject(error);
				};

				socket.onclose = () => {
					console.log('WebSocket connection closed');
					document.getElementById('connection-status').textContent = 'Disconnected';
					document.getElementById('connection-status').className = 'connection-status disconnected';
				};
			} catch (err) {
				console.error('Failed to initialize WebSocket:', err);
				reject(err);
			}
		});
	}

	function on(eventType, callback) {
		callbacks[eventType] = callback;
	}

	// Make sure the sendMove function includes the current turn
	function sendMove(move) {
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;

		socket.send(JSON.stringify({
			type: 'move',
			gameId: gameId,
			move: move,
			player: playerColor
		}));

		console.log('Move sent to server:', move);
		return true;
	}

	function createGame() {
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;

		socket.send(JSON.stringify({
			type: 'create_game'
		}));

		return true;
	}

	function joinGame(id) {
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;

		socket.send(JSON.stringify({
			type: 'join_game',
			gameId: id
		}));

		return true;
	}

	function setGameInfo(id, color) {
		gameId = id;
		playerColor = color;
	}

	// Add a new function to check connection status
	function getConnectionInfo() {
		return {
			connected: socket && socket.readyState === WebSocket.OPEN,
			gameId: gameId,
			playerColor: playerColor
		};
	}

	// Add a heartbeat to keep connection alive
	function startHeartbeat() {
		const heartbeatInterval = setInterval(() => {
			if (socket && socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({
					type: 'heartbeat',
					gameId: gameId
				}));
			} else {
				clearInterval(heartbeatInterval);
			}
		}, 30000); // Every 30 seconds
	}

	function sendPass(data) {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			console.error("Cannot send pass: Socket not connected");
			return false;
		}

		socket.send(JSON.stringify({
			type: 'pass',
			player: data.player,
			gameId: data.gameId  // Make sure this line exists!
		}));

		return true;
	}

	function sendGameOver(data) {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			console.error("Cannot send game over: Socket not connected");
			return false;
		}

		socket.send(JSON.stringify({
			type: 'game_over',
			gameId: data.gameId,
			winner: data.winner,
			reason: data.reason
		}));

		return true;
	}

	function reconnect() {
		return init().catch(err => {
			console.error("Reconnection failed:", err);
			return false;
		});
	}

	return {
		init,
		on,
		sendMove,
		createGame,
		joinGame,
		setGameInfo,
		getConnectionInfo,
		sendPass,
		reconnect,
		sendGameOver,  // Add this new method
		isConnected() {
			return socket && socket.readyState === WebSocket.OPEN;
		},
		get gameId() {
			return gameId;
		},
		get playerColor() {
			return playerColor;
		}
	};
})();