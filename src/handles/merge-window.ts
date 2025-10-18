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
	(
		window: chrome.windows.Window
	): window is chrome.windows.Window & {
		incognito: T;
		type: typeof targetWindowType;
	} =>
		isWindowType(window, { incognito });

const ensureWindowId = (window: chrome.windows.Window): number => {
	if (typeof window.id === 'number') {
		return window.id;
	}

	throw new Error('The first window is undefined or null.');
};

/**
 * Safely retrieves tabs from a window.
 * Returns an empty array if tabs are not available, preventing crashes.
 * @param window - Window returned from the Chrome API.
 * @returns Array of tabs, or empty array if tabs are not available.
 */
const safeGetTabs = (window: chrome.windows.Window): chrome.tabs.Tab[] => {
	if (Array.isArray(window.tabs)) {
		return window.tabs;
	}

	console.debug(`Window with id ${window.id ?? 'unknown'} has no tabs; skipping.`);
	return [];
};

type TabPartition = {
	groupIds: number[];
	ungroupedTabIds: number[];
	pinnedTabIds: number[];
	mutedTabIds: number[];
};

const partitionTabs = (tabs: chrome.tabs.Tab[]): TabPartition => {
	const interim = tabs.reduce(
		(accumulator, tab) => {
			const { id, groupId, pinned, mutedInfo } = tab;
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

				if (mutedInfo?.muted === true) {
					accumulator.mutedTabIds.push(id);
				}
			}

			return accumulator;
		},
		{
			groupIds: new Set<number>(),
			ungroupedTabIds: [] as number[],
			pinnedTabIds: [] as number[],
			mutedTabIds: [] as number[],
		}
	);

	return {
		groupIds: [...interim.groupIds],
		ungroupedTabIds: interim.ungroupedTabIds,
		pinnedTabIds: interim.pinnedTabIds,
		mutedTabIds: interim.mutedTabIds,
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

	await Promise.all(groupIds.map((groupId) => chrome.tabGroups.move(groupId, moveProperties)));
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

/**
 * Re-applies muted state lost during Chrome's tab move operations.
 * Must be called after repinTabs to avoid interference with pin restoration.
 * @param tabIds - Identifiers of tabs whose muted status must be restored.
 */
const remuteTabs = async (tabIds: number[]): Promise<void> => {
	if (tabIds.length === 0) {
		return;
	}

	await Promise.all(tabIds.map((tabId) => chrome.tabs.update(tabId, { muted: true })));
};

const runSequentially = (tasks: Array<() => Promise<void>>): Promise<void> =>
	tasks.reduce<Promise<void>>((previous, task) => previous.then(() => task()), Promise.resolve());

/**
 * Filters out windows that have no tabs or empty tab arrays.
 * Prevents exceptions when processing windows without meaningful content.
 * @param window - Window to validate.
 * @returns `true` if the window has at least one tab.
 */
const hasValidTabs = (window: chrome.windows.Window): boolean => {
	const tabs = safeGetTabs(window);
	return tabs.length > 0;
};

const mergeWindow = async (windows: chrome.windows.Window[]) => {
	const validWindows = windows.filter(hasValidTabs);

	if (validWindows.length <= 1) {
		console.debug(`Merge skipped: only ${validWindows.length} valid window(s) found.`);
		return;
	}

	const [firstWindow, ...restWindows] = validWindows;
	const targetWindowId = ensureWindowId(firstWindow);

	const tasks = restWindows.map((window) => {
		const partition = partitionTabs(safeGetTabs(window));
		return () =>
			moveTabsToTargetWindow(partition, targetWindowId)
				.then(() => repinTabs(partition.pinnedTabIds))
				.then(() => remuteTabs(partition.mutedTabIds));
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
