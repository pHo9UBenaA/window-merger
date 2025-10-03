const targetWindowType = 'normal' satisfies chrome.windows.windowTypeEnum;

/**
 * Narrows a window to the shape the merger expects: normal type and the requested incognito state.
 * Guards call sites from accidentally mixing window types by enforcing the `type`/`incognito` pairing at compile time.
 * @template T - Incognito mode to assert.
 * @param window - Window returned from the Chrome API.
 * @param param1.incognito - Incognito flag that must be preserved.
 * @returns `true` when the window matches the supported shape.
 */
const isWindowType = <T extends boolean>(
	window: chrome.windows.Window,
	{ incognito }: { incognito: T }
): window is chrome.windows.Window & {
	incognito: T;
	type: typeof targetWindowType;
} => {
	return window.incognito === incognito && window.type === targetWindowType;
};

const filterByWindowType =
	<T extends boolean>(incognito: T) =>
	(window: chrome.windows.Window): window is chrome.windows.Window & {
		incognito: T;
		type: typeof targetWindowType;
	} => isWindowType(window, { incognito });

const ensureWindowId = (window: chrome.windows.Window): number => {
	if (typeof window.id === 'number') {
		return window.id;
	}

	throw new Error('The first window is undefined or null.');
};

const ensureTabs = (window: chrome.windows.Window): chrome.tabs.Tab[] => {
	if (Array.isArray(window.tabs)) {
		return window.tabs;
	}

	throw new Error(
		`Window with id ${window.id ?? 'unknown'} does not have any tabs: ${JSON.stringify(window)}`
	);
};

type TabPartition = {
	groupIds: number[];
	ungroupedTabIds: number[];
	pinnedTabIds: number[];
};

const partitionTabs = (tabs: chrome.tabs.Tab[]): TabPartition => {
	const interim = tabs.reduce(
		(accumulator, tab) => {
			const { id, groupId, pinned } = tab;
			const isGrouped = typeof groupId === 'number' && groupId > 0;

			if (isGrouped) {
				accumulator.groupIds.add(groupId);
			}

			if (typeof id === 'number') {
				if (!isGrouped) {
					accumulator.ungroupedTabIds.push(id);
				}

				if (pinned) {
					accumulator.pinnedTabIds.push(id);
				}
			}

			return accumulator;
		},
		{
			groupIds: new Set<number>(),
			ungroupedTabIds: [] as number[],
			pinnedTabIds: [] as number[],
		}
	);

	return {
		groupIds: [...interim.groupIds],
		ungroupedTabIds: interim.ungroupedTabIds,
		pinnedTabIds: interim.pinnedTabIds,
	};
};

const createMoveProperties = (
	targetWindowId: number
): chrome.tabGroups.MoveProperties & chrome.tabs.MoveProperties => ({
	windowId: targetWindowId,
	index: -1,
});

const moveGroupedTabs = async (
	groupIds: number[],
	moveProperties: chrome.tabGroups.MoveProperties & chrome.tabs.MoveProperties
): Promise<void> => {
	if (groupIds.length === 0) {
		return;
	}

	await Promise.all(
		groupIds.map((groupId) => chrome.tabGroups.move(groupId, moveProperties))
	);
};

const moveUngroupedTabs = async (
	tabIds: number[],
	moveProperties: chrome.tabGroups.MoveProperties & chrome.tabs.MoveProperties
): Promise<void> => {
	if (tabIds.length === 0) {
		return;
	}

	await chrome.tabs.move(tabIds, moveProperties);
};

/**
 * Relocates the given tabs into the target window without breaking Chrome tab groups.
 * Runs group moves first so membership survives, then appends loose tabs with `chrome.tabs.move`.
 * @param partition - Tabs scheduled for relocation partitioned by their characteristics.
 * @param targetWindowId - Identifier of the destination window.
 */
const moveTabsToTargetWindow = async (
	partition: TabPartition,
	targetWindowId: number
): Promise<void> => {
	const moveProperties = createMoveProperties(targetWindowId);

	await moveGroupedTabs(partition.groupIds, moveProperties);
	await moveUngroupedTabs(partition.ungroupedTabIds, moveProperties);
};

/**
 * Re-applies pinning lost during Chrome's tab move operations.
 * @param tabIds - Identifiers of tabs whose pinned status must be restored.
 */
const repinTabs = async (tabIds: number[]): Promise<void> => {
	if (tabIds.length === 0) {
		return;
	}

	await Promise.all(tabIds.map((tabId) => chrome.tabs.update(tabId, { pinned: true })));
};

const runSequentially = (tasks: Array<() => Promise<void>>): Promise<void> =>
	tasks.reduce<Promise<void>>(
		(previous, task) => previous.then(() => task()),
		Promise.resolve()
	);

const mergeWindow = async (windows: chrome.windows.Window[]) => {
	if (windows.length <= 1) {
		return;
	}

	const [firstWindow, ...restWindows] = windows;
	const targetWindowId = ensureWindowId(firstWindow);

	const tasks = restWindows.map((window) => {
		const partition = partitionTabs(ensureTabs(window));
		return () =>
			moveTabsToTargetWindow(partition, targetWindowId).then(() =>
				repinTabs(partition.pinnedTabIds)
			);
	});

	await runSequentially(tasks);
};

const mergeWindowsByIncognito = (incognito: boolean) =>
	chrome.windows
		.getAll({ populate: true })
		.then((windows) => windows.filter(filterByWindowType(incognito)))
		.then(mergeWindow);

const createMergeHandler = (incognito: boolean) => () =>
	mergeWindowsByIncognito(incognito).catch((error) => {
		console.error('Failed to process:', error);
	});

const handleMergeWindowEvent = createMergeHandler(false);
const handleMergeIncognitoWindowEvent = createMergeHandler(true);

export { handleMergeIncognitoWindowEvent, handleMergeWindowEvent };
