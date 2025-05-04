// Main application entry point

document.addEventListener('DOMContentLoaded', function () {
	console.log('MetaChess app initialized');

	// Initialize the chessboard
	const { chess, board } = MetachessBoard.init('chessboard');

	// Initialize game with the chess and board instances
	MetachessGame.init(chess, board);

	// Add event listeners for controls
	document.getElementById('white-redraw').addEventListener('click', MetachessGame.redrawHand);
	document.getElementById('white-pass').addEventListener('click', MetachessGame.passTurn);
	document.getElementById('black-redraw').addEventListener('click', MetachessGame.redrawHand);
	document.getElementById('black-pass').addEventListener('click', MetachessGame.passTurn);

	// Close waiting modal for single player mode
	const waitingModal = document.getElementById('waiting-modal');
	if (waitingModal) {
		waitingModal.style.display = 'none';
	}

	// Update game status
	document.getElementById('game-status').textContent = 'Single Player Mode';
});