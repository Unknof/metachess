// Deck handling functions
const MetachessDeck = (function () {
	// Piece types and their default counts
	const defaultDeckConfig = {
		'pawn': 20,
		'knight': 10,
		'bishop': 10,
		'rook': 10,
		'queen': 5,
		'king': 5
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

			// Get the correct piece filename and create the full URL
			const pieceFilename = pieceFilenames[color][pieceType];
			const pieceUrl = pieceBaseUrl + pieceFilename;

			// Add piece image and text
			card.innerHTML = `
                <div class="card-content">
                    <img src="${pieceUrl}" class="piece-image" alt="${pieceType}">
                    <div class="piece-name">${pieceType.charAt(0).toUpperCase() + pieceType.slice(1)}</div>
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