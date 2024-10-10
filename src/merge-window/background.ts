import { ContextMenuIds } from './constants/context-menu';
import { handleMergeSecretWindowEvent, handleMergeWindowEvent } from './handles/merge-window';

const handleMapper = {
	[ContextMenuIds.mergeWindow]: handleMergeWindowEvent,
	[ContextMenuIds.mergeSecretWindow]: handleMergeSecretWindowEvent,
} as const satisfies { [key in ContextMenuIds]: () => void };

const removeAllContextMenus = () => {
	chrome.contextMenus.removeAll();
};

const createContextMenu = (id: string, message: string) => {
	chrome.contextMenus.create({
		id,
		title: chrome.i18n.getMessage(message),
		contexts: ['all'],
	});
};

const initContextMenus = () => {
	removeAllContextMenus();
	createContextMenu(ContextMenuIds.mergeWindow, 'mergeWindowTitle');
	createContextMenu(ContextMenuIds.mergeSecretWindow, 'mergeIncognitoWindowTitle');
};

const updateMergeSecretWindowContextMenu = async () => {
	const isAllowedIncognitoAccess = await chrome.extension.isAllowedIncognitoAccess();
	chrome.contextMenus.update(ContextMenuIds.mergeSecretWindow, {
		enabled: isAllowedIncognitoAccess,
	});
};

chrome.runtime.onInstalled.addListener(() => {
	initContextMenus();
	updateMergeSecretWindowContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	const menuItemId = info.menuItemId.toString();
	if (menuItemId in handleMapper) {
		handleMapper[menuItemId as ContextMenuIds]();
	}
});

chrome.action.onClicked.addListener((tab) => {
	const handles = Object.values(handleMapper);
	handles.forEach((handle) => handle());
});

// TODO
updateMergeSecretWindowContextMenu();
