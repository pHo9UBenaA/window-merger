import { createChromeTabAdapter } from './adapters/chrome/tab';
import { createChromeTabGroupAdapter } from './adapters/chrome/tab-group';
import { createChromeWindowAdapter } from './adapters/chrome/window';
import { mergeWindows } from './app/merge-windows';
import { ContextMenuIds, ContextMenuTitles } from './constants/context-menu';

/**
 * Creates a merge handler with injected dependencies.
 * @param incognito - Whether to merge incognito or regular windows.
 * @returns Handler function that executes the merge.
 */
const createMergeHandler = (incognito: boolean) => async (): Promise<void> => {
	const deps = {
		windowPort: createChromeWindowAdapter(),
		tabPort: createChromeTabAdapter(),
		tabGroupPort: createChromeTabGroupAdapter(),
	};

	const result = await mergeWindows(incognito, deps);

	if (!result.ok) {
		console.error('Failed to merge windows:', result.error);
	}
};

const handleMergeWindowEvent = createMergeHandler(false);
const handleMergeIncognitoWindowEvent = createMergeHandler(true);

const handleMapper = {
	[ContextMenuIds.mergeWindow]: handleMergeWindowEvent,
	[ContextMenuIds.mergeIncognitoWindow]: handleMergeIncognitoWindowEvent,
} as const satisfies { [key in ContextMenuIds]: () => void };

const contextMenuIdSet: ReadonlySet<string> = new Set(Object.values(ContextMenuIds));

/**
 * Checks whether menu ID is managed by this extension.
 * @param menuItemId - Menu item ID.
 * @returns True when the ID is a known context menu ID.
 */
const isContextMenuId = (menuItemId: string): menuItemId is ContextMenuIds => {
	return contextMenuIdSet.has(menuItemId);
};

chrome.runtime.onInstalled.addListener(() => {
	const removeAllContextMenus = () => {
		chrome.contextMenus.removeAll();
	};

	const createContextMenu = (id: ContextMenuIds, message: ContextMenuTitles) => {
		chrome.contextMenus.create({
			id,
			title: chrome.i18n.getMessage(message),
			contexts: ['all'],
		});
	};

	const syncMenuStateWithIncognitoPermission = async () => {
		const isAllowedIncognitoAccess = await chrome.extension.isAllowedIncognitoAccess();
		chrome.contextMenus.update(ContextMenuIds.mergeIncognitoWindow, {
			enabled: isAllowedIncognitoAccess,
		});
	};

	removeAllContextMenus();

	createContextMenu(ContextMenuIds.mergeWindow, ContextMenuTitles.mergeWindow);
	createContextMenu(ContextMenuIds.mergeIncognitoWindow, ContextMenuTitles.mergeIncognitoWindow);

	void syncMenuStateWithIncognitoPermission();
});

chrome.contextMenus.onClicked.addListener((info) => {
	const menuItemId = info.menuItemId.toString();
	if (isContextMenuId(menuItemId)) {
		void handleMapper[menuItemId]();
	}
});

chrome.action.onClicked.addListener(() => {
	const handles = Object.values(handleMapper);
	for (const handle of handles) {
		void handle();
	}
});
