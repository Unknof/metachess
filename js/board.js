const MetachessBoard = (function () {
	let chess = null;

	function init(boardId = 'chessboard', orientation = 'white') {
		chess = new Chess();

		// Initialize chessboard with Lichess pieces
		const config = {
			position: 'start',
			showNotation: true,
			draggable: false,
			orientation: orientation, // Set the board orientation
			pieceTheme: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/{piece}.svg'
		};

		const board = Chessboard(boardId, config);

		// Update status initially
		updateStatus();

		return {
			chess,
			board
		};
	}

	function updateStatus() {
		if (!chess) return;

		let status = '';

		// Check various game states
		if (chess.in_checkmate()) {
			const winner = chess.turn() === 'w' ? 'BLACK' : 'WHITE';
			status = `CHECKMATE! ${winner} wins!`;
		} else if (chess.in_stalemate()) {
			status = 'STALEMATE! Game is a draw.';
		} else if (chess.in_draw()) {
			status = 'DRAW! Game is a draw.';
		} else if (chess.in_check()) {
			const inCheck = chess.turn() === 'w' ? 'WHITE' : 'BLACK';
			status = `${inCheck} is in CHECK!`;
		} else {
			status = (chess.turn() === 'w' ? 'WHITE' : 'BLACK') + ' to move';
		}

		// Update status message
		document.getElementById('status-message').textContent = status;
	}

	return {
		init,
		updateStatus
	};
})();