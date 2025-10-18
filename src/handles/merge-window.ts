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
	activeTabId: number | undefined;
};

const partitionTabs = (tabs: chrome.tabs.Tab[]): TabPartition => {
	const interim = tabs.reduce(
		(accumulator, tab) => {
			const { id, groupId, pinned, mutedInfo, active } = tab;
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

				if (active === true) {
					accumulator.activeTabId = id;
				}
			}

			return accumulator;
		},
		{
			groupIds: new Set<number>(),
			ungroupedTabIds: [] as number[],
			pinnedTabIds: [] as number[],
			mutedTabIds: [] as number[],
			activeTabId: undefined as number | undefined,
		}
	);

	return {
		groupIds: [...interim.groupIds],
		ungroupedTabIds: interim.ungroupedTabIds,
		pinnedTabIds: interim.pinnedTabIds,
		mutedTabIds: interim.mutedTabIds,
		activeTabId: interim.activeTabId,
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
 * Moves tabs to achieve final layout: pinned tabs → tab groups → regular tabs (all in chronological order).
 * With index: -1 (append to end): grouped tabs first, then ungrouped tabs.
 * Finally, pinning is restored which moves pinned tabs to the front automatically.
 * @param partition - Tabs scheduled for relocation partitioned by their characteristics.
 * @param targetWindowId - Identifier of the destination window.
 */
const moveTabsToTargetWindow = async (
	partition: TabPartition,
	targetWindowId: number
): Promise<void> => {
	const moveProperties = createMoveProperties(targetWindowId);

	// Move grouped tabs first (they appear at the end, but before ungrouped)
	await moveGroupedTabs(partition.groupIds, moveProperties);
	// Move ungrouped tabs second (they appear after grouped tabs)
	await moveUngroupedTabs(partition.ungroupedTabIds, moveProperties);
	// Finally, repinTabs will move pinned tabs to the front
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

/**
 * Restores the active tab state after merge operations.
 * Ensures the user's focused tab remains active.
 * @param tabId - Identifier of the tab to activate, or undefined to skip.
 */
const reactivateTab = async (tabId: number | undefined): Promise<void> => {
	if (typeof tabId !== 'number') {
		return;
	}

	await chrome.tabs.update(tabId, { active: true });
};

/**
 * Reorders all tabs in the target window to achieve the desired layout:
 * pinned tabs (by ID/creation order) → tab groups (by ID/creation order) → regular tabs (by ID/creation order).
 * Tab IDs are used as a proxy for creation order since Chrome Tab API doesn't provide creation timestamps.
 * Moves tab groups as units to preserve group membership.
 * @param targetWindowId - The window whose tabs should be reordered.
 */
const reorderTabsInWindow = async (targetWindowId: number): Promise<void> => {
	// Get all tabs in the target window
	const tabs = await chrome.tabs.query({ windowId: targetWindowId });

	// Safety check
	if (!Array.isArray(tabs) || tabs.length === 0) {
		return;
	}

	// Sort all tabs by ID (proxy for creation order)
	const sortedTabs = [...tabs].sort((a, b) => {
		const idA = a.id ?? Number.MAX_SAFE_INTEGER;
		const idB = b.id ?? Number.MAX_SAFE_INTEGER;
		return idA - idB;
	});

	// Partition sorted tabs by type
	const pinnedTabs = sortedTabs.filter((tab) => tab.pinned === true);
	const groupedTabs = sortedTabs.filter(
		(tab) => tab.pinned === false && typeof tab.groupId === 'number' && tab.groupId > 0
	);
	const regularTabs = sortedTabs.filter(
		(tab) => tab.pinned === false && (typeof tab.groupId !== 'number' || tab.groupId <= 0)
	);

	// Get unique group IDs in order of first appearance (by tab ID)
	const groupIds = [...new Set(groupedTabs.map((tab) => tab.groupId))].filter(
		(id): id is number => typeof id === 'number' && id > 0
	);

	// Calculate target positions
	let currentIndex = pinnedTabs.length; // Start after pinned tabs

	// Move each group to its correct position
	for (const groupId of groupIds) {
		await chrome.tabGroups.move(groupId, { windowId: targetWindowId, index: currentIndex });
		// Count tabs in this group to update the current index
		const tabsInGroup = groupedTabs.filter((tab) => tab.groupId === groupId);
		currentIndex += tabsInGroup.length;
	}

	// Move regular tabs one by one to the end (in ID order)
	for (const tab of regularTabs) {
		if (typeof tab.id === 'number') {
			await chrome.tabs.move(tab.id, { index: currentIndex });
			currentIndex += 1;
		}
	}
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

/**
 * Sorts windows to prioritize the best merge target.
 * Priority order:
 * 1. Focused window (user's current active window)
 * 2. Windows in normal or maximized state (over minimized)
 * This ensures merging into the user's working context rather than a hidden window.
 * @param a - First window to compare.
 * @param b - Second window to compare.
 * @returns Sort order (-1, 0, or 1).
 */
const sortWindowsByTargetPriority = (
	a: chrome.windows.Window,
	b: chrome.windows.Window
): number => {
	// Focused window takes highest priority
	if (a.focused && !b.focused) return -1;
	if (!a.focused && b.focused) return 1;

	// Next priority: normal/maximized over minimized
	const aPreferredState = a.state === 'normal' || a.state === 'maximized';
	const bPreferredState = b.state === 'normal' || b.state === 'maximized';

	if (aPreferredState && !bPreferredState) return -1;
	if (!aPreferredState && bPreferredState) return 1;

	// No preference
	return 0;
};

const mergeWindow = async (windows: chrome.windows.Window[]) => {
	const validWindows = windows.filter(hasValidTabs);

	if (validWindows.length <= 1) {
		console.debug(`Merge skipped: only ${validWindows.length} valid window(s) found.`);
		return;
	}

	const sortedWindows = [...validWindows].sort(sortWindowsByTargetPriority);
	const [firstWindow, ...restWindows] = sortedWindows;
	const targetWindowId = ensureWindowId(firstWindow);

	// Collect active tab IDs from all windows being merged
	const activeTabIds: number[] = [];

	const tasks = restWindows.map((window) => {
		const partition = partitionTabs(safeGetTabs(window));
		if (typeof partition.activeTabId === 'number') {
			activeTabIds.push(partition.activeTabId);
		}
		return () =>
			moveTabsToTargetWindow(partition, targetWindowId)
				.then(() => repinTabs(partition.pinnedTabIds))
				.then(() => remuteTabs(partition.mutedTabIds));
	});

	await runSequentially(tasks);

	// Reorder all tabs to ensure correct layout: pinned → groups → regular
	await reorderTabsInWindow(targetWindowId);

	// Restore the last active tab (from the last merged window)
	if (activeTabIds.length > 0) {
		await reactivateTab(activeTabIds[activeTabIds.length - 1]);
	}
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
