import { ContextMenuIds, ContextMenuTitles, isContextMenuId } from './constants/context-menu';
import { handleMergeIncognitoWindowEvent, handleMergeWindowEvent } from './handles/merge-window';

const handleMapper = {
	[ContextMenuIds.mergeWindow]: handleMergeWindowEvent,
	[ContextMenuIds.mergeIncognitoWindow]: handleMergeIncognitoWindowEvent,
} as const satisfies { [key in ContextMenuIds]: () => void };

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

const initContextMenus = async () => {
	removeAllContextMenus();
	createContextMenu(ContextMenuIds.mergeWindow, ContextMenuTitles.mergeWindow);
	createContextMenu(ContextMenuIds.mergeIncognitoWindow, ContextMenuTitles.mergeIncognitoWindow);
};

const updateMergeIncognitoWindowContextMenu = async () => {
	const isAllowedIncognitoAccess = await chrome.extension.isAllowedIncognitoAccess();
	chrome.contextMenus.update(ContextMenuIds.mergeIncognitoWindow, {
		enabled: isAllowedIncognitoAccess,
	});
};

chrome.runtime.onInstalled.addListener(() => {
	initContextMenus();
	updateMergeIncognitoWindowContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, _) => {
	const menuItemId = info.menuItemId.toString();
	if (isContextMenuId(menuItemId)) {
		handleMapper[menuItemId]();
	}
});

chrome.action.onClicked.addListener((_) => {
	const handles = Object.values(handleMapper);
	for (const handle of handles) {
		handle();
	}
});
