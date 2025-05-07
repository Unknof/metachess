// UI handling functions will go here
const MetachessUI = (function () {
	// UI functionality will be implemented here

	function setAppHeight() {
		const doc = document.documentElement;
		doc.style.setProperty('--app-height', `${window.innerHeight}px`);
	}

	// Run on load and resize
	window.addEventListener('resize', setAppHeight);
	window.addEventListener('orientationchange', setAppHeight);
	setAppHeight();

	return {
		// Methods will be exposed here
	};
})();