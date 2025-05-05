// Deck handling functions
const MetachessDeck = (function () {
	// Piece types and their default counts
	const defaultDeckConfig = {
		'p': 35,
		'n': 9,
		'b': 8,
		'r': 7,
		'q': 5,
		'k': 4
	};

	// Mapping piece types to Lichess file names
	const pieceFilenames = {
		'white': {
			'pawn': 'wP.svg',
			'knight': 'wN.svg',
			'bishop': 'wB.svg',
			'rook': 'wR.svg',
			'queen': 'wQ.svg',
			'king': 'wK.svg'
		},
		'black': {
			'pawn': 'bP.svg',
			'knight': 'bN.svg',
			'bishop': 'bB.svg',
			'rook': 'bR.svg',
			'queen': 'bQ.svg',
			'king': 'bK.svg'
		}
	};

	// Base URL for chess pieces
	const pieceBaseUrl = "https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/";

	function createDeck(customConfig = {}) {
		const deck = [];
		const config = { ...defaultDeckConfig, ...customConfig };

		// Create deck based on configuration
		for (const [pieceType, count] of Object.entries(config)) {
			for (let i = 0; i < count; i++) {
				deck.push(pieceType);
			}
		}

		// Shuffle deck
		return shuffleDeck([...deck]);
	}

	function shuffleDeck(deck) {
		for (let i = deck.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[deck[i], deck[j]] = [deck[j], deck[i]]; // Swap
		}
		return deck;
	}

	function drawCards(deck, count = 1) {
		if (deck.length === 0) return [];

		const drawn = [];
		for (let i = 0; i < count && deck.length > 0; i++) {
			drawn.push(deck.pop());
		}
		return drawn;
	}

	function renderCards(hand, containerId, color = 'white', isActive = false) {
		// Normalize color to lowercase and ensure it's either 'white' or 'black'
		color = (color && color.toLowerCase() === 'black') ? 'black' : 'white';

		const container = document.getElementById(containerId);
		container.innerHTML = '';

		hand.forEach((pieceType, index) => {
			const card = document.createElement('div');
			card.className = `piece-card ${isActive ? 'active' : 'inactive'}`;
			card.dataset.pieceType = pieceType;
			card.dataset.index = index;

			// Use 1-letter code for image and name
			const pieceNameMap = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };
			const pieceName = pieceNameMap[pieceType.toLowerCase()] || pieceType;

			// Use Lichess piece images - same as the board uses
			const pieceColor = pieceType === pieceType.toLowerCase() ? 'w' : 'b';
			const pieceChar = pieceType.toLowerCase();
			const lichessPiece = `${pieceColor}${pieceChar.toUpperCase()}`;
			const pieceUrl = `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${lichessPiece}.svg`;

			card.innerHTML = `
				<div class="card-content">
					<img src="${pieceUrl}" class="piece-image" alt="${pieceName}">
					<div class="piece-name">${pieceName}</div>
				</div>
			`;
			container.appendChild(card);
		});
	}

	return {
		createDeck,
		drawCards,
		renderCards,
		shuffleDeck
	};
})();