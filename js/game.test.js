/**
 * @jest-environment jsdom
 */
const { test, expect, beforeEach } = require('@jest/globals');

// First import Chess and make it available globally
const { Chess } = require('../lib/chess.js');
global.Chess = Chess;  // Make it available to the game module

// Mock necessary globals
global.Audio = class {
	constructor() { this.play = jest.fn().mockResolvedValue(); }
};

document.getElementById = jest.fn().mockImplementation(() => ({
	addEventListener: jest.fn(),
	style: {},
	className: '',
	appendChild: jest.fn(),
	textContent: '',
	classList: {
		toggle: jest.fn(),
		add: jest.fn(),
		remove: jest.fn()
	}
}));

document.createElement = jest.fn().mockImplementation(() => ({
	className: '',
	style: {},
	textContent: '',
	id: null
}));

// Fix the document.querySelector mock to include classList.toggle
document.querySelector = jest.fn().mockImplementation(() => ({
	appendChild: jest.fn(),
	classList: {
		toggle: jest.fn(),
		add: jest.fn(),
		remove: jest.fn()
	}
}));

// Mock MetachessDeck BEFORE requiring the game module
global.MetachessDeck = {
	drawCards: jest.fn().mockReturnValue([]),
	createDeck: jest.fn().mockReturnValue(['p', 'p', 'n', 'b', 'r', 'q', 'k']),
	shuffleDeck: jest.fn().mockImplementation(deck => deck),
	renderCards: jest.fn()
};

global.MetachessEngine = {
	init: jest.fn().mockReturnValue(true),
	getBestMoveForPieceType: jest.fn().mockResolvedValue("e2e4")
};

// Now require the game module so it loads into global
require('./game');

// Then get the global MetachessGame object that was created
const MetachessGame = global.MetachessGame;

// Mock the socket module
const MetachessSocket = {
	isConnected: jest.fn().mockReturnValue(false),
	sendGameOver: jest.fn(),
	on: jest.fn(),
	gameId: 'test-game',
	playerColor: 'white'
};
global.MetachessSocket = MetachessSocket;

// Test for black losing on time after white passes
test('black should lose when time runs out after white passes', () => {
	// Setup fake timers at the beginning of the test
	jest.useFakeTimers();

	// Mock chess instance
	const chess = new Chess();

	// Setup initial game state
	MetachessGame.init(chess, { position: () => { } });

	// Set game state directly
	MetachessGame.setTimeControl({
		white: 5,
		black: 1,  // Black only has 1 second left
		started: true,
		lastMoveTime: Date.now() - 500 // Last move was 0.5 seconds ago
	});

	// Set current turn to white
	MetachessGame.setTurn('white');

	// White passes their turn
	MetachessGame.passTurn();

	// Verify turn changed to black
	expect(MetachessGame.getCurrentTurn()).toBe('black');

	// Log black's time to see what's happening
	console.log('Black time before advancing timer:', MetachessGame.getTimeControl().black);

	// Fast forward time by 1.5 seconds to exceed black's remaining time
	jest.advanceTimersByTime(1500);

	// Debug: check black's time after advancing
	console.log('Black time after advancing timer:', MetachessGame.getTimeControl().black);

	// Instead of checking for the function call, check the game state directly
	expect(MetachessGame.getTimeControl().black).toBe(0);  // Time should be zero
	expect(MetachessGame.isGameOver()).toBe(true);         // Game should be over


	// Clean up
	jest.useRealTimers();
});