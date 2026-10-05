import { ContextMenuIds, setupContextMenus } from './adapters/chrome/context-menu';
import { createChromeTabAdapter } from './adapters/chrome/tab';
import { createChromeTabGroupAdapter } from './adapters/chrome/tab-group';
import { createChromeWindowAdapter } from './adapters/chrome/window';
import { mergeWindows } from './application/merge-windows';
import { createWindowId } from './domain/window-merge.types';

const deps = {
	windowPort: createChromeWindowAdapter(),
	tabPort: createChromeTabAdapter(),
	tabGroupPort: createChromeTabGroupAdapter(),
};

const createMergeHandler = (incognito: boolean) => {
	let running = false;

	return async (triggerWindowId?: number): Promise<void> => {
		if (running) {
			return;
		}

		running = true;
		try {
			const preferredTargetWindowId =
				triggerWindowId === undefined
					? undefined
					: (createWindowId(triggerWindowId) ?? undefined);
			const result = await mergeWindows(incognito, deps, preferredTargetWindowId);
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

chrome.contextMenus.onClicked.addListener(({ menuItemId }, tab) => {
	switch (menuItemId) {
		case ContextMenuIds.mergeWindow:
			void handleMergeWindowEvent(tab?.windowId);
			break;
		case ContextMenuIds.mergeIncognitoWindow:
			void handleMergeIncognitoWindowEvent(tab?.windowId);
			break;
	}
});

chrome.action.onClicked.addListener((tab) => {
	void handleMergeWindowEvent(tab.windowId);
	void handleMergeIncognitoWindowEvent(tab.windowId);
});

// Also refresh persisted menus after worker restarts and incognito-permission reloads.
initializeMenus();
