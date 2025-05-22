// --- Cookie-based player ID helpers ---
function setCookie(name, value, days = 365) {
	const expires = new Date(Date.now() + days * 864e5).toUTCString();
	document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
}

function getCookie(name) {
	return document.cookie.split('; ').reduce((r, v) => {
		const parts = v.split('=');
		return parts[0] === name ? decodeURIComponent(parts[1]) : r
	}, '');
}

function getOrCreatePlayerId() {
	let playerId = getCookie('metachess_player_id');
	if (!playerId) {
		playerId = 'player_' + Math.random().toString(36).substring(2, 15);
		setCookie('metachess_player_id', playerId);
	}
	return playerId;
}
// --- End cookie helpers ---

const MetachessSocket = (function () {
	let socket = null;
	let gameId = null;
	let playerColor = null;
	let callbacks = {};
	let chess = null; // Add this at the top of the IIFE



	function setChessInstance(chessInstance) {
		chess = chessInstance;
	}

	function init(serverUrl = window.location.hostname === 'localhost' ?
		'ws://localhost:8080' :
		`wss://${window.location.host}`) {
		return new Promise((resolve, reject) => {
			try {
				// Get player ID from cookie
				const playerId = getOrCreatePlayerId();

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

					// Send player ID immediately upon connection
					socket.send(JSON.stringify({
						type: 'identify_player',
						playerId: playerId
					}));

					resolve(true);
				};

				socket.onmessage = (event) => {
					const data = JSON.parse(event.data);
					//console.log('Message received:', data);

					// Handle game creation
					if (data.type === 'game_created' && data.gameId && data.playerColor) {
						setGameInfo(data.gameId, data.playerColor);
					}

					// Handle join result
					if (data.type === 'join_result' && data.success && data.gameId && data.playerColor) {
						setGameInfo(data.gameId, data.playerColor);
					}

					// Handle reconnect result
					if (data.type === 'reconnect_result' && data.success && data.gameId && data.playerColor) {
						setGameInfo(data.gameId, data.playerColor);
					}

					// Call any registered callbacks
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
					const connectionStatus = document.getElementById('connection-status');
					if (connectionStatus) {
						connectionStatus.textContent = 'Disconnected';
						connectionStatus.className = 'connection-status disconnected';
					}
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
			player: playerColor,
			fen: chess.fen()
		}));

		console.log('Move sent to server:', move);
		console.log('Current FEN:', chess.fen());
		return true;
	}

	function createGame() {
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;

		socket.send(JSON.stringify({
			type: 'create_game',
			playerId: getOrCreatePlayerId()
		}));

		return true;
	}

	function joinGame(id) {
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;

		socket.send(JSON.stringify({
			type: 'join_game',
			gameId: id,
			playerId: getOrCreatePlayerId()
		}));

		return true;
	}

	function setGameInfo(id, color) {
		gameId = id;
		playerColor = color;

		// Automatically store the session when game info is set
		if (id && color) {
			import('./game_modules/multiplayer.js').then(module => {
				module.storeGameSession(id, color);
			}).catch(err => {
				console.error('Failed to import multiplayer module:', err);
			});
		}
	}

	// Add a new function to check connection status
	function getConnectionInfo() {
		return {
			connected: socket && socket.readyState === WebSocket.OPEN,
			gameId: gameId,
			playerColor: playerColor
		};
	}

	function startHeartbeat() {
		const heartbeatInterval = setInterval(() => {
			// Only send heartbeat if gameId is set (multiplayer game is active)
			if (socket && socket.readyState === WebSocket.OPEN && gameId) {
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
			gameId: data.gameId,
			//fen: chess.fen()
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
			loser: data.loser || (data.winner === 'white' ? 'black' : 'white'),
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
	function reconnectToGame(gameId, playerColor) {
		console.log(`Attempting to reconnect to game ${gameId}`);

		// Restore local state immediately so outgoing messages have correct info
		if (gameId) {
			// Set local state so sendMove, sendPass, etc. use correct IDs
			setGameInfo(gameId, playerColor || null);
		}

		return reconnect().then(success => {
			if (!success) {
				return false;
			}

			// Now send the game reconnection message
			socket.send(JSON.stringify({
				type: 'reconnect',
				gameId: gameId,
				playerId: getOrCreatePlayerId()
			}));

			return true;
		});
	}

	function sendCheckValidMoves(data) {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			console.error("Cannot send check valid moves: Socket not connected");
			return false;
		}

		console.log("SENDING check_valid_moves:", data);
		socket.send(JSON.stringify({
			type: 'check_valid_moves',
			gameId: data.gameId,
			player: data.player,
		}));

		return true;
	}

	function sendCheckGame(gameId) {
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;
		socket.send(JSON.stringify({
			type: 'check_game',
			gameId
		}));
		return true;
	}

	function sendResign(data) {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			console.error("Cannot send resign: Socket not connected");
			return false;
		}

		socket.send(JSON.stringify({
			type: 'resign',
			gameId: data.gameId,
			player: data.player
		}));

		return true;
	}
	function sendRematchOffer(data) {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			console.error("Cannot send rematch offer: Socket not connected");
			return false;
		}
		socket.send(JSON.stringify({
			type: 'rematch_offer',
			gameId: data.gameId,
			player: data.player
		}));
		return true;
	}

	function off(eventType, callback) {
		if (callbacks[eventType] === callback) {
			delete callbacks[eventType];
		}
	}


	return {
		init,
		on,
		off,
		sendMove,
		createGame,
		joinGame,
		setGameInfo,
		getConnectionInfo,
		sendPass,
		reconnect,
		reconnectToGame,
		sendCheckGame,
		sendGameOver,
		sendCheckValidMoves,
		setChessInstance,
		sendResign,
		sendRematchOffer,
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

export { MetachessSocket };