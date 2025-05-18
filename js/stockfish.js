const MetachessEngine = (function () {
	let engine = null;
	let isReady = false;
	let lastMove = null;

	function init() {
		try {
			// Use a local stockfish.js file instead of the CDN
			engine = new Worker('js/stockfish-engine.js');

			engine.addEventListener('message', function (e) {
				//console.log("Stockfish: " + e.data);

				// Parse response
				if (e.data === "readyok") {
					isReady = true;
				} else if (e.data.startsWith("bestmove")) {
					lastMove = e.data.split(' ')[1];
				}
			});

			// Initialize engine
			engine.postMessage("uci");
			engine.postMessage("isready");
			return true;
		} catch (error) {
			console.error("Failed to initialize Stockfish:", error);
			return false;
		}
	}

	function getBestMoveForPieceType(fen, pieceType) {
		return new Promise((resolve, reject) => {
			if (!engine) {
				reject("Engine not initialized");
				return;
			}

			// Get piece type code for filtering
			const pieceTypeCode = getPieceTypeCode(pieceType);
			if (!pieceTypeCode) {
				reject(`Invalid piece type: ${pieceType}`);
				return;
			}

			// Create a temporary Chess instance to get legal moves
			const tempChess = new Chess(fen);

			// Get all legal moves for the selected piece type
			const legalMoves = [];
			const allMoves = tempChess.moves({ verbose: true });

			// Filter moves to only include the selected piece type
			for (const move of allMoves) {
				const piece = tempChess.get(move.from);
				if (piece && piece.type === pieceTypeCode) {
					legalMoves.push(move.from + move.to + (move.promotion || ''));
				}
			}

			console.log(`Legal ${pieceType} moves:`, legalMoves);

			if (legalMoves.length === 0) {
				reject(`No legal moves for ${pieceType}`);
				return;
			}

			// Check for king captures first
			for (const moveStr of legalMoves) {
				const to = moveStr.substring(2, 4);
				const targetPiece = tempChess.get(to);
				if (targetPiece && targetPiece.type === 'k') {
					console.log(`Found king capture move: ${moveStr} - selecting immediately`);
					resolve(moveStr);
					return;
				}
			}

			// Variables to track search progress
			const targetDepth = 15;
			const targetSelDepth = 14; // New target for selective depth
			let currentDepth = 0;
			let currentSelDepth = 0;
			let depthReached = false;
			let moveHandler;

			// Create a listener that monitors for depth information
			moveHandler = function (e) {
				const data = e.data;

				// Check if we've reached our target depth criteria
				if (data.includes('depth') && !depthReached) {
					// Parse both depth and seldepth
					const depthMatch = data.match(/depth (\d+)/);
					const selDepthMatch = data.match(/seldepth (\d+)/);

					if (depthMatch && depthMatch[1]) {
						currentDepth = parseInt(depthMatch[1]);

						// Also capture seldepth if available
						if (selDepthMatch && selDepthMatch[1]) {
							currentSelDepth = parseInt(selDepthMatch[1]);
							//console.log(`Search progress: depth ${currentDepth}, selective depth ${currentSelDepth}`);
						} else {
							//console.log(`Search progress: depth ${currentDepth}`);
						}

						// Stop if EITHER regular depth or selective depth targets are met
						if (currentDepth >= targetDepth || currentSelDepth >= targetSelDepth) {
							depthReached = true;
							console.log(`Search target reached! depth=${currentDepth}, seldepth=${currentSelDepth}`);
							engine.postMessage("stop");
						}
					}
				}

				// When we get the bestmove response, resolve the promise
				if (data.startsWith("bestmove")) {
					engine.removeEventListener('message', moveHandler);
					const bestMove = data.split(' ')[1];

					if (bestMove && legalMoves.includes(bestMove)) {
						console.log(`Engine found move: ${bestMove} (depth=${currentDepth}, seldepth=${currentSelDepth})`);
						resolve(bestMove);
					} else {
						console.log(`Using fallback move (depth=${currentDepth}, seldepth=${currentSelDepth})`);
						resolve(legalMoves[0]);
					}
				}
			};

			// Add the temporary listener
			engine.addEventListener('message', moveHandler);

			// Set position from FEN
			engine.postMessage("position fen " + fen);

			// Start the search to the specified depth
			const searchCommand = "go depth " + targetDepth + " searchmoves " + legalMoves.join(' ');
			console.log("Search command:", searchCommand);
			engine.postMessage(searchCommand);

			// Safety timeout of 5 seconds in case engine gets stuck
			const timeout = setTimeout(() => {
				console.log("Safety timeout reached before depth was completed");
				engine.postMessage("stop");

				// The engine will respond with bestmove which will trigger our handler
			}, 5000);
		});
	}

	// Helper function to convert piece type name to chess.js piece type code
	function getPieceTypeCode(pieceType) {
		const pieceTypes = {
			'pawn': 'p',
			'knight': 'n',
			'bishop': 'b',
			'rook': 'r',
			'queen': 'q',
			'king': 'k'
		};
		return pieceTypes[pieceType.toLowerCase()];
	}

	return {
		init,
		getBestMoveForPieceType
	};
})();