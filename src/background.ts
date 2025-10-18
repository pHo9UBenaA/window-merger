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
	try {
		const deps = {
			windowPort: createChromeWindowAdapter(),
			tabPort: createChromeTabAdapter(),
			tabGroupPort: createChromeTabGroupAdapter(),
		};

		await mergeWindows(incognito, deps);
	} catch (error) {
		console.error('Failed to merge windows:', error);
	}
};

const handleMergeWindowEvent = createMergeHandler(false);
const handleMergeIncognitoWindowEvent = createMergeHandler(true);

const handleMapper = {
	[ContextMenuIds.mergeWindow]: handleMergeWindowEvent,
	[ContextMenuIds.mergeIncognitoWindow]: handleMergeIncognitoWindowEvent,
} as const satisfies { [key in ContextMenuIds]: () => void };

chrome.runtime.onInstalled.addListener(() => {
	const removeAllContextMenus = () => {
		chrome.contextMenus.removeAll();
	};

	const createContextMenu = (id: ContextMenuIds, message: ContextMenuTitles) => {
		chrome.contextMenus.create({
			id,
			title: chrome.i18n.getMessage(message),
			// Memo: Keeping this as `all` avoids surprising users even though the `page` default would suffice
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

	syncMenuStateWithIncognitoPermission();
});

chrome.contextMenus.onClicked.addListener((info) => {
	const isContextMenuId = (title: string): title is ContextMenuIds =>
		Object.values(ContextMenuIds).includes(title as ContextMenuIds);

	const menuItemId = info.menuItemId.toString();
	if (isContextMenuId(menuItemId)) {
		handleMapper[menuItemId]();
	}
});

chrome.action.onClicked.addListener(() => {
	const handles = Object.values(handleMapper);
	for (const handle of handles) {
		handle();
	}
});
