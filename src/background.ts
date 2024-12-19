import { ContextMenuIds, ContextMenuTitles } from './constants/context-menu';
import { handleMergeIncognitoWindowEvent, handleMergeWindowEvent } from './handles/merge-window';

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
			// Memo: 最初にallにしてしまってたから混乱を避けるためにそのままにしてるけどデフォルト（page）のままでよかった
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
