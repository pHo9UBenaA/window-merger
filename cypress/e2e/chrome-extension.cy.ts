describe('Chrome Extension E2E Tests', () => {
	before(() => {
		cy.visit('chrome://extensions/');

		cy.get('div.items-container extensions-item').eq(1).find('#detailsButton').click();

		cy.get('#allow-incognito').find('#crToggle').click();
	});

	it('should create context menu items', () => {
		cy.visit('https://example.com');
		cy.window().rightclick();
		cy.contains('Merge Windows').should('exist');
		cy.contains('Merge Incognito Windows').should('exist');
	});

	// it('should merge normal windows', () => {
	// 	// Open a new window
	// 	cy.window().then((win) => {
	// 		win.open('https://example.com', '_blank');
	// 	});

	// 	// Click the extension icon
	// 	cy.get('#extension-icon').click();

	// 	// Check if windows are merged
	// 	cy.window().then((win) => {
	// 		expect(win.length).to.equal(1);
	// 	});
	// });

	// it('should merge incognito windows', () => {
	// 	// This test might not be possible in Cypress due to limitations with incognito mode
	// 	// You may need to use a different testing framework for this specific functionality
	// });

	// it('should respond to keyboard shortcut', () => {
	// 	cy.visit('https://example.com');
	// 	// Simulate the keyboard shortcut (Ctrl+M or Command+M)
	// 	cy.get('body').type('{ctrl}m');
	// 	// Check if the merge action was triggered
	// 	// This might require adding some observable side effect to verify
	// });
});
