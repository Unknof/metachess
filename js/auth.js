export const Auth = (function () {
	let currentUser = null;

	// Check if user is logged in on page load
	function init() {
		const savedUser = localStorage.getItem('metachess_user');
		if (savedUser) {
			currentUser = JSON.parse(savedUser);
			updateUIForLoggedInUser();
		}
	}

	function updateUIForLoggedInUser() {
		const profileBtn = document.getElementById('main-menu-profile');
		if (profileBtn && currentUser) {
			profileBtn.textContent = currentUser.username;
		}
	}

	async function login(email, password) {
		try {
			const response = await fetch('/api/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, password })
			});

			const data = await response.json();

			if (response.ok) {
				currentUser = data.user;
				localStorage.setItem('metachess_user', JSON.stringify(currentUser));

				// Update the player ID cookie to match the account
				setCookie('metachess_player_id', currentUser.playerId);

				updateUIForLoggedInUser();
				return { success: true, user: currentUser };
			} else {
				return { success: false, error: data.error };
			}
		} catch (error) {
			console.error('Login error:', error);
			return { success: false, error: 'Network error' };
		}
	}

	async function register(username, email, password) {
		try {
			// Get current player ID from cookie
			const playerId = getOrCreatePlayerId();

			const response = await fetch('/api/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ username, email, password, playerId })
			});

			const data = await response.json();

			if (response.ok) {
				// Auto-login after successful registration
				return await login(email, password);
			} else {
				return { success: false, error: data.error };
			}
		} catch (error) {
			console.error('Registration error:', error);
			return { success: false, error: 'Network error' };
		}
	}

	function logout() {
		currentUser = null;
		localStorage.removeItem('metachess_user');

		const profileBtn = document.getElementById('main-menu-profile');
		if (profileBtn) {
			profileBtn.textContent = 'Profile';
		}
	}

	function getCurrentUser() {
		return currentUser;
	}

	function isLoggedIn() {
		return currentUser !== null;
	}

	// Helper functions (you might already have these in socket.js)
	function setCookie(name, value, days = 365) {
		const expires = new Date(Date.now() + days * 864e5).toUTCString();
		document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
	}

	function getOrCreatePlayerId() {
		// Import this from your socket.js or duplicate the logic
		let playerId = getCookie('metachess_player_id');
		if (!playerId) {
			playerId = 'player_' + Math.random().toString(36).substring(2, 15);
			setCookie('metachess_player_id', playerId);
		}
		return playerId;
	}

	function getCookie(name) {
		return document.cookie.split('; ').reduce((r, v) => {
			const parts = v.split('=');
			return parts[0] === name ? decodeURIComponent(parts[1]) : r
		}, '');
	}

	return {
		init,
		login,
		register,
		logout,
		getCurrentUser,
		isLoggedIn
	};
})();