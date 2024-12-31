const targetWindowType = 'normal' satisfies chrome.windows.windowTypeEnum;

const isWindowType = <T extends boolean>(
	window: chrome.windows.Window,
	{ incognito }: { incognito: T }
): window is chrome.windows.Window & { incognito: T; type: typeof targetWindowType } => {
	return window.incognito === incognito && window.type === targetWindowType;
};

const moveTabs = async (tabs: chrome.tabs.Tab[], firstWindowId: number) => {
	const tabIds = tabs
		.map((tab) => tab.id)
		.filter((tabId): tabId is number => tabId !== undefined);

	if (tabIds.length > 0) {
		await chrome.tabs.move(tabIds, { windowId: firstWindowId, index: -1 });
	}

	const fatalCount = tabs.length - tabIds.length;
	if (fatalCount > 0) {
		throw new Error(`Merge skipped because ${fatalCount} tab IDs could not be found`);
	}
};

const mergeWindow = async (windowIds: number[]) => {
	if (windowIds.length <= 1) {
		console.info('There was only one window.');
		return;
	}

	const [firstWindowId, ..._] = windowIds;
	if (!firstWindowId) {
		throw new Error('The first window could not be found.');
	}

	for (const windowId of windowIds) {
		const tabs = await chrome.tabs.query({ windowId });
		await moveTabs(tabs, firstWindowId);
	}
};

const handleMergeWindowEvent = async () => {
	try {
		const windows = await chrome.windows.getAll({ populate: true });
		const windowIds: number[] = windows
			.map((window) => (isWindowType(window, { incognito: false }) ? window.id : undefined))
			.filter((id) => id !== undefined);
		await mergeWindow(windowIds);
	} catch (error) {
		console.error('Failed to process:', error);
	}
};

const handleMergeIncognitoWindowEvent = async () => {
	try {
		const windows = await chrome.windows.getAll({ populate: true });
		const incognitoWindowIds: number[] = windows
			.map((window) => (isWindowType(window, { incognito: true }) ? window.id : undefined))
			.filter((id) => id !== undefined);
		await mergeWindow(incognitoWindowIds);
	} catch (error) {
		console.error('Failed to process:', error);
	}
};

export { handleMergeIncognitoWindowEvent, handleMergeWindowEvent };
