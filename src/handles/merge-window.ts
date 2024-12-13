const targetWindowType = 'normal' as const satisfies chrome.windows.windowTypeEnum;

const isWindowType = <T extends boolean>(
	window: chrome.windows.Window,
	{ incognito }: { incognito: T }
): window is chrome.windows.Window & { incognito: T; type: typeof targetWindowType } =>
	window.incognito === incognito && window.type === targetWindowType;

const moveTabs = (tabs: chrome.tabs.Tab[], firstWindowId: number): number => {
	const tabIds = tabs
		.map((tab) => tab.id)
		.filter((tabId) => tabId !== undefined);

	for (const tabId of tabIds) {
		chrome.tabs.move(tabId, {
			windowId: firstWindowId,
			index: -1,
		});
	}

	const fatalCount = tabs.length - tabIds.length;
	return fatalCount;
};

const mergeWindow = (windowIds: number[]) => {
	if (windowIds.length <= 1) {
		console.info('There was only one window.');
		return;
	}

	const firstWindowId = windowIds.shift();
	if (!firstWindowId) {
		console.error('The first window could not be found.');
		return;
	}

	for (const windowId of windowIds) {
		chrome.tabs.query({ windowId }, (tabs) => {
			const fatalCount = moveTabs(tabs, firstWindowId);
			if (fatalCount) {
				console.error(`Merge skipped because ${fatalCount} tab IDs could not be found`);
			}
		});
	}
};

const handleMergeWindowEvent = () => {
	chrome.windows.getAll({ populate: true }, (windows) => {
		const windowIds: number[] = windows
			.map((window) => (isWindowType(window, { incognito: false }) ? window.id : undefined))
			.filter((id) => id !== undefined);
		mergeWindow(windowIds);
	});
};

const handleMergeIncognitoWindowEvent = () => {
	chrome.windows.getAll({ populate: true }, (windows) => {
		const incognitoWindowIds: number[] = windows
			.map((window) => (isWindowType(window, { incognito: true }) ? window.id : undefined))
			.filter((id) => id !== undefined);
		mergeWindow(incognitoWindowIds);
	});
};

export { handleMergeIncognitoWindowEvent, handleMergeWindowEvent };
