const MetachessEngine = (function () {
	let engine = null;
	let isReady = false;
	let lastMove = null;

	function init() {
		try {
			// Use a local stockfish.js file instead of the CDN
			engine = new Worker('js/stockfish-engine.js');

			engine.addEventListener('message', function (e) {
				console.log("Stockfish: " + e.data);

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

			// Set position from FEN
			engine.postMessage("position fen " + fen);

			// Use the "searchmoves" command to restrict search to the filtered moves
			const searchCommand = "go depth 10 searchmoves " + legalMoves.join(' ');
			console.log("Search command:", searchCommand);
			engine.postMessage(searchCommand);

			// Create a timeout to get the move
			const timeout = setTimeout(() => {
				engine.postMessage("stop");

				if (lastMove && legalMoves.includes(lastMove)) {
					console.log("Engine found move:", lastMove);
					resolve(lastMove);
				} else {
					// If no move is found, just use the first legal move for this piece type
					console.log("No best move found, using first legal move:", legalMoves[0]);
					resolve(legalMoves[0]);
				}
			}, 1000); // Allow 1 second for thinking
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