import { ContextMenuIds, setupContextMenus } from './adapters/chrome/context-menu';
import { createChromeTabAdapter } from './adapters/chrome/tab';
import { createChromeTabGroupAdapter } from './adapters/chrome/tab-group';
import { createChromeWindowAdapter } from './adapters/chrome/window';
import { mergeWindows } from './application/merge-windows';

const deps = {
	windowPort: createChromeWindowAdapter(),
	tabPort: createChromeTabAdapter(),
	tabGroupPort: createChromeTabGroupAdapter(),
};

const createMergeHandler = (incognito: boolean) => {
	let running = false;

	return async (): Promise<void> => {
		if (running) {
			return;
		}

		running = true;
		try {
			const result = await mergeWindows(incognito, deps);
			if (!result.ok && result.error.type !== 'insufficient-windows') {
				console.error('Failed to merge windows:', result.error);
			}
		} catch (error) {
			console.error('Failed to merge windows:', error);
		} finally {
			running = false;
		}
	};
};

const handleMergeWindowEvent = createMergeHandler(false);
const handleMergeIncognitoWindowEvent = createMergeHandler(true);

// One successful setup per worker lifetime; a later lifecycle event can retry a failure.
let menuSetup: Promise<void> | undefined;
const initializeMenus = (): void => {
	if (menuSetup) return;
	menuSetup = setupContextMenus().catch((error) => {
		menuSetup = undefined;
		console.error('Failed to set up context menus:', error);
	});
};

chrome.runtime.onInstalled.addListener(initializeMenus);
chrome.runtime.onStartup.addListener(initializeMenus);

chrome.contextMenus.onClicked.addListener(({ menuItemId }) => {
	switch (menuItemId) {
		case ContextMenuIds.mergeWindow:
			void handleMergeWindowEvent();
			break;
		case ContextMenuIds.mergeIncognitoWindow:
			void handleMergeIncognitoWindowEvent();
			break;
	}
});

chrome.action.onClicked.addListener(() => {
	void handleMergeWindowEvent();
	void handleMergeIncognitoWindowEvent();
});

// Also rebuild persisted menus after worker restarts and incognito-permission reloads.
initializeMenus();
