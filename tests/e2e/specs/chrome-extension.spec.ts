import { test, expect, type BrowserContext } from '@playwright/test';
import path from 'path';

let context: BrowserContext;
let extensionId: string;

// test.beforeAll(async () => {
// 	const pathToExtension = path.join(__dirname, '../src');
// 	context = await chromium.launchPersistentContext('', {
// 		headless: false,
// 		args: [
// 			`--disable-extensions-except=${pathToExtension}`,
// 			`--load-extension=${pathToExtension}`,
// 		],
// 	});

// 	let [background] = context.serviceWorkers();
// 	if (!background) background = await context.waitForEvent('serviceworker');
// 	extensionId = background.url().split('/')[2];
// });

// test.afterAll(async () => {
// 	await context.close();
// });

// test('Context menu items are created', async ({ page }) => {
// 	await page.goto('https://example.com');

// 	const contextMenu = await page.evaluate(() => {
// 		return new Promise((resolve) => {
// 			chrome.contextMenus.getAll((menuItems) => {
// 				resolve(menuItems);
// 			});
// 		});
// 	});

// 	expect(contextMenu).toHaveLength(2);
// 	expect(contextMenu[0].id).toBe('mergeWindow');
// 	expect(contextMenu[1].id).toBe('mergeSecretWindow');
// });

test('Merge normal windows', async ({ context }) => {
	// Create two normal windows
	const window1 = await context.newPage();
	await window1.goto('https://example.com');
	const window2 = await context.newPage();
	await window2.goto('https://playwright.dev');

	// Trigger merge action
	await window1.evaluate(() => {
		chrome.runtime.sendMessage({ action: 'mergeWindow' });
	});

	// Wait for the merge to complete
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Check if all tabs are in one window
	const windows = context.pages();
	expect(windows).toHaveLength(2); // Including the background page

	const tabs = await windows[1].evaluate(() => {
		return new Promise((resolve) => {
			chrome.tabs.query({}, (tabs) => {
				resolve(tabs);
			});
		});
	});

	expect(tabs).toHaveLength(2);
});

// test('Merge incognito windows', async ({ context }) => {
// 	// Create two incognito windows
// 	const incognitoContext = await context.newContext({ isIncognito: true });
// 	const incognitoWindow1 = await incognitoContext.newPage();
// 	await incognitoWindow1.goto('https://example.com');
// 	const incognitoWindow2 = await incognitoContext.newPage();
// 	await incognitoWindow2.goto('https://playwright.dev');

// 	// Trigger merge action
// 	await incognitoWindow1.evaluate(() => {
// 		chrome.runtime.sendMessage({ action: 'mergeSecretWindow' });
// 	});

// 	// Wait for the merge to complete
// 	await new Promise((resolve) => setTimeout(resolve, 1000));

// 	// Check if all incognito tabs are in one window
// 	const incognitoWindows = incognitoContext.pages();
// 	expect(incognitoWindows).toHaveLength(1);

// 	const incognitoTabs = await incognitoWindows[0].evaluate(() => {
// 		return new Promise((resolve) => {
// 			chrome.tabs.query({ incognito: true }, (tabs) => {
// 				resolve(tabs);
// 			});
// 		});
// 	});

// 	expect(incognitoTabs).toHaveLength(2);
// });

// test('Extension icon click merges all windows', async ({ context }) => {
// 	// Create normal and incognito windows
// 	const normalWindow = await context.newPage();
// 	await normalWindow.goto('https://example.com');
// 	const incognitoContext = await context.newContext({ isIncognito: true });
// 	const incognitoWindow = await incognitoContext.newPage();
// 	await incognitoWindow.goto('https://playwright.dev');

// 	// Simulate extension icon click
// 	await normalWindow.evaluate(() => {
// 		chrome.action.onClicked.dispatch();
// 	});

// 	// Wait for the merge to complete
// 	await new Promise((resolve) => setTimeout(resolve, 1000));

// 	// Check if normal windows are merged
// 	const normalWindows = context.pages();
// 	expect(normalWindows).toHaveLength(2); // Including the background page

// 	const normalTabs = await normalWindows[1].evaluate(() => {
// 		return new Promise((resolve) => {
// 			chrome.tabs.query({ incognito: false }, (tabs) => {
// 				resolve(tabs);
// 			});
// 		});
// 	});

// 	expect(normalTabs).toHaveLength(2);

// 	// Check if incognito windows are merged
// 	const incognitoWindows = incognitoContext.pages();
// 	expect(incognitoWindows).toHaveLength(1);

// 	const incognitoTabs = await incognitoWindows[0].evaluate(() => {
// 		return new Promise((resolve) => {
// 			chrome.tabs.query({ incognito: true }, (tabs) => {
// 				resolve(tabs);
// 			});
// 		});
// 	});

// 	expect(incognitoTabs).toHaveLength(1);
// });
