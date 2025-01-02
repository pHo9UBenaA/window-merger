const targetWindowType = 'normal' satisfies chrome.windows.windowTypeEnum;

const isWindowType = <T extends boolean>(
	window: chrome.windows.Window,
	{ incognito }: { incognito: T }
): window is chrome.windows.Window & { incognito: T; type: typeof targetWindowType } => {
	return window.incognito === incognito && window.type === targetWindowType;
};

const moveTabs = async (tabs: chrome.tabs.Tab[], firstWindowId: number) => {
	const moveProperties = { windowId: firstWindowId, index: -1 } as const;

	const groupTabs = tabs.filter((tab) => tab.groupId > 0);

	const groupIds = [...new Set(groupTabs.map((tab) => tab.groupId))];

	// Memo: `.filter((tab) => tab.groupId <= 0);`を避けるためだけどやりすぎかも
	const groupTabIdSet = new Set(groupTabs.map((tab) => tab.id));
	const ungroupedTabIds = tabs
		.filter((tab) => !groupTabIdSet.has(tab.id))
		.map((tab) => tab.id)
		.filter((tabId): tabId is number => tabId !== undefined);

	if (groupIds.length > 0) {
		await Promise.all(
			Array.from(groupIds).map((groupId) => chrome.tabGroups.move(groupId, moveProperties))
		);
	}

	if (ungroupedTabIds.length > 0) {
		await chrome.tabs.move(ungroupedTabIds, moveProperties);
	}
};

const mergeWindow = async (windowIds: number[]) => {
	if (windowIds.length <= 1) {
		return;
	}

	const [firstWindowId, ...restWindowIds] = windowIds;
	if (!firstWindowId) {
		throw new Error('The first window could not be found.');
	}

	for (const windowId of restWindowIds) {
		const tabs = await chrome.tabs.query({ windowId });
		await moveTabs(tabs, firstWindowId);
		for (const tab of tabs) {
			if (tab.id === undefined) {
				console.info('Undefined tab id:', tab);
			}
		}
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
