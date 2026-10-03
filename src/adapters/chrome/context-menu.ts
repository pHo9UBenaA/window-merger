export const ContextMenuIds = {
	mergeWindow: 'mergeWindowId',
	mergeIncognitoWindow: 'mergeIncognitoWindowId',
} as const;

// Callback APIs work on Chrome 120 too. lastError is only valid inside the callback.
const menuOperation = (start: (done: () => void) => void): Promise<void> =>
	new Promise((resolve, reject) => {
		start(() => {
			const error = chrome.runtime.lastError;
			if (error) {
				reject(new Error(error.message));
				return;
			}
			resolve();
		});
	});

const createMenu = (properties: chrome.contextMenus.CreateProperties): Promise<void> =>
	menuOperation((done) => chrome.contextMenus.create(properties, done));

export const setupContextMenus = async (): Promise<void> => {
	const allowed = await chrome.extension.isAllowedIncognitoAccess();
	await menuOperation((done) => chrome.contextMenus.removeAll(done));
	await createMenu({
		id: ContextMenuIds.mergeWindow,
		title: chrome.i18n.getMessage('mergeWindowTitle'),
		contexts: ['all'],
		enabled: true,
	});
	await createMenu({
		id: ContextMenuIds.mergeIncognitoWindow,
		title: chrome.i18n.getMessage('mergeIncognitoWindowTitle'),
		contexts: ['all'],
		enabled: allowed,
	});
};
