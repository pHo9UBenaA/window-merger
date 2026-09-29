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

const ensureMenu = async (
	properties: chrome.contextMenus.CreateProperties & { id: string }
): Promise<void> => {
	const { id, ...update } = properties;
	let updateError: unknown;
	try {
		await menuOperation((done) => chrome.contextMenus.update(id, update, done));
		return;
	} catch (error) {
		updateError = error;
	}

	// Menus persist across worker restarts. Only create when updating did not succeed.
	try {
		await menuOperation((done) => chrome.contextMenus.create(properties, done));
	} catch (createError) {
		throw new AggregateError([updateError, createError], `Failed to initialize menu ${id}`);
	}
};

export const setupContextMenus = async (): Promise<void> => {
	const allowed = await chrome.extension.isAllowedIncognitoAccess();
	await ensureMenu({
		id: ContextMenuIds.mergeWindow,
		title: chrome.i18n.getMessage(ContextMenuTitles.mergeWindow),
		contexts: ['all'],
		enabled: true,
	});
	await ensureMenu({
		id: ContextMenuIds.mergeIncognitoWindow,
		title: chrome.i18n.getMessage(ContextMenuTitles.mergeIncognitoWindow),
		contexts: ['all'],
		enabled: allowed,
	});
};
