import { ContextMenuIds, setupContextMenus } from './adapters/chrome/context-menu';
import { createChromeTabAdapter } from './adapters/chrome/tab';
import { createChromeTabGroupAdapter } from './adapters/chrome/tab-group';
import { createChromeWindowAdapter } from './adapters/chrome/window';
import { mergeWindows } from './application/merge-windows';

const createMergeHandler = (incognito: boolean) => async (): Promise<void> => {
	const deps = {
		windowPort: createChromeWindowAdapter(),
		tabPort: createChromeTabAdapter(),
		tabGroupPort: createChromeTabGroupAdapter(),
	};

	const result = await mergeWindows(incognito, deps);

	if (!result.ok && result.error.type !== 'insufficient-windows') {
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

const isContextMenuId = (menuItemId: string): menuItemId is ContextMenuIds => {
	return contextMenuIdSet.has(menuItemId);
};

chrome.runtime.onInstalled.addListener(() => {
	setupContextMenus().catch((error) => {
		console.error('Failed to set up context menus:', error);
	});
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
