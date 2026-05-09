export const ContextMenuIds = {
	mergeWindow: 'mergeWindowId',
	mergeIncognitoWindow: 'mergeIncognitoWindowId',
} as const;

export const ContextMenuTitles = {
	mergeWindow: 'mergeWindowTitle',
	mergeIncognitoWindow: 'mergeIncognitoWindowTitle',
} as const;

export type ContextMenuIds = (typeof ContextMenuIds)[keyof typeof ContextMenuIds];

export type ContextMenuTitles = (typeof ContextMenuTitles)[keyof typeof ContextMenuTitles];

export const setupContextMenus = async (): Promise<void> => {
	await chrome.contextMenus.removeAll();

	chrome.contextMenus.create({
		id: ContextMenuIds.mergeWindow,
		title: chrome.i18n.getMessage(ContextMenuTitles.mergeWindow),
		contexts: ['all'],
	});

	chrome.contextMenus.create({
		id: ContextMenuIds.mergeIncognitoWindow,
		title: chrome.i18n.getMessage(ContextMenuTitles.mergeIncognitoWindow),
		contexts: ['all'],
	});

	const isAllowedIncognitoAccess = await chrome.extension.isAllowedIncognitoAccess();
	chrome.contextMenus.update(ContextMenuIds.mergeIncognitoWindow, {
		enabled: isAllowedIncognitoAccess,
	});
};
