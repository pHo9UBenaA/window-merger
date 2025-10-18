/**
 * Application use case: Merge Windows
 * Pure orchestration logic that coordinates domain logic and port capabilities.
 * No direct Chrome API dependencies - only uses injected port interfaces.
 */

import { hasValidTabs, planMerge } from '../core/logic/window-merge';
import { type MergeError, type MergeResult, TARGET_WINDOW_TYPE } from '../core/types/window-merge';
import type { Result } from '../foundation/result';
import { failure } from '../foundation/result';
import type { TabPort } from '../ports/tab';
import type { TabGroupPort } from '../ports/tab-group';
import type { WindowPort } from '../ports/window';

/**
 * Dependencies required by the merge windows use case.
 */
export type MergeWindowsDeps = {
	readonly windowPort: WindowPort;
	readonly tabPort: TabPort;
	readonly tabGroupPort: TabGroupPort;
};

/**
 * Filters windows by incognito status and target type.
 * @param windows - Chrome windows.
 * @param incognito - Incognito mode to filter by.
 * @returns Array of valid windows matching the criteria.
 */
const filterWindows = (
	windows: readonly chrome.windows.Window[],
	incognito: boolean
): chrome.windows.Window[] => {
	return windows.filter((window) => {
		// Incognito mode check
		if (window.incognito !== incognito) {
			return false;
		}

		// Type check
		if (window.type !== TARGET_WINDOW_TYPE) {
			return false;
		}

		// Must have valid ID
		if (typeof window.id !== 'number') {
			return false;
		}

		// Must have tabs
		if (!hasValidTabs(window)) {
			return false;
		}

		return true;
	});
};

/**
 * Moves tabs from a source window to the target window.
 * Preserves tab groups, pinning, and muting.
 * @param tabs - Tabs from source window.
 * @param targetWindowId - Destination window ID.
 * @param deps - Port dependencies.
 */
const moveTabsToTarget = async (
	tabs: readonly chrome.tabs.Tab[],
	targetWindowId: NonNullable<chrome.windows.Window['id']>,
	deps: MergeWindowsDeps
): Promise<void> => {
	const moveProperties = { windowId: targetWindowId, index: -1 };

	// Extract tab characteristics
	const groupIds = [
		...new Set(
			tabs
				.map((tab) => tab.groupId)
				.filter(
					(id): id is NonNullable<chrome.tabs.Tab['groupId']> =>
						typeof id === 'number' && id > 0
				)
		),
	];
	const ungroupedTabIds = tabs
		.filter(
			(tab) =>
				typeof tab.id === 'number' && (typeof tab.groupId !== 'number' || tab.groupId <= 0)
		)
		.map((tab) => tab.id as number);
	const pinnedTabIds = tabs
		.filter((tab) => tab.pinned)
		.map((tab) => tab.id)
		.filter((id): id is number => typeof id === 'number');
	const mutedTabIds = tabs
		.filter((tab) => tab.mutedInfo?.muted === true)
		.map((tab) => tab.id)
		.filter((id): id is number => typeof id === 'number');

	// Move grouped tabs first
	if (groupIds.length > 0) {
		await Promise.all(
			groupIds.map((groupId) => deps.tabGroupPort.moveGroup(groupId, moveProperties))
		);
	}

	// Move ungrouped tabs
	if (ungroupedTabIds.length > 0) {
		await deps.tabPort.moveTabs(ungroupedTabIds, moveProperties);
	}

	// Restore pinning
	if (pinnedTabIds.length > 0) {
		await Promise.all(
			pinnedTabIds.map((tabId) => deps.tabPort.updateTab(tabId, { pinned: true }))
		);
	}

	// Restore muting
	if (mutedTabIds.length > 0) {
		await Promise.all(
			mutedTabIds.map((tabId) => deps.tabPort.updateTab(tabId, { muted: true }))
		);
	}
};

/**
 * Reorders tabs in the target window after merge.
 * Ensures layout: pinned tabs → tab groups → regular tabs.
 * @param targetWindowId - The window to reorder.
 * @param deps - Port dependencies.
 */
const reorderTabsInWindow = async (
	targetWindowId: NonNullable<chrome.windows.Window['id']>,
	deps: MergeWindowsDeps
): Promise<void> => {
	const tabs = await deps.tabPort.queryTabs(targetWindowId);

	if (tabs.length === 0) {
		return;
	}

	// Sort by ID (proxy for creation order)
	const sortedTabs = [...tabs].sort((a, b) => {
		const idA = a.id ?? Number.MAX_SAFE_INTEGER;
		const idB = b.id ?? Number.MAX_SAFE_INTEGER;
		return idA - idB;
	});

	const pinnedTabs = sortedTabs.filter((tab) => tab.pinned === true);
	const groupedTabs = sortedTabs.filter(
		(tab) => tab.pinned === false && typeof tab.groupId === 'number' && tab.groupId > 0
	);
	const regularTabs = sortedTabs.filter(
		(tab) => tab.pinned === false && (typeof tab.groupId !== 'number' || tab.groupId <= 0)
	);

	const groupIds = [
		...new Set(
			groupedTabs
				.map((tab) => tab.groupId)
				.filter(
					(id): id is NonNullable<chrome.tabs.Tab['groupId']> =>
						typeof id === 'number' && id > 0
				)
		),
	];

	let currentIndex = pinnedTabs.length;

	// Move each group
	for (const groupId of groupIds) {
		await deps.tabGroupPort.moveGroup(groupId, {
			windowId: targetWindowId,
			index: currentIndex,
		});
		const tabsInGroup = groupedTabs.filter((tab) => tab.groupId === groupId);
		currentIndex += tabsInGroup.length;
	}

	// Move regular tabs
	for (const tab of regularTabs) {
		if (typeof tab.id === 'number') {
			await deps.tabPort.moveTabs(tab.id, { windowId: targetWindowId, index: currentIndex });
			currentIndex += 1;
		}
	}
};

/**
 * Executes the merge operation.
 * @param windows - Windows to merge.
 * @param deps - Port dependencies.
 * @returns Result containing MergeResult or error.
 */
const executeMerge = async (
	windows: readonly chrome.windows.Window[],
	deps: MergeWindowsDeps
): Promise<Result<MergeResult, MergeError>> => {
	const plan = planMerge(windows);

	if (!plan.ok) {
		return plan;
	}

	const sourceWindows = windows.filter((window) => window.id !== plan.data.targetWindowId);

	// Move tabs from each source window sequentially
	for (const sourceWindow of sourceWindows) {
		await moveTabsToTarget(sourceWindow.tabs ?? [], plan.data.targetWindowId, deps);
	}

	// Reorder all tabs in target window
	await reorderTabsInWindow(plan.data.targetWindowId, deps);

	// Activate the determined tab
	if (typeof plan.data.activeTabId === 'number') {
		await deps.tabPort.updateTab(plan.data.activeTabId, { active: true });
	}

	return plan;
};

/**
 * Merges all windows with the specified incognito mode.
 * Main entry point for the merge windows use case.
 * @param incognito - Whether to merge incognito or regular windows.
 * @param deps - Injected port dependencies.
 * @returns Result containing MergeResult or error.
 */
export const mergeWindows = async (
	incognito: boolean,
	deps: MergeWindowsDeps
): Promise<Result<MergeResult, MergeError>> => {
	const rawWindows = await deps.windowPort.getAllWindows(true);
	const windows = filterWindows(rawWindows, incognito);

	if (windows.length <= 1) {
		return failure({
			type: 'insufficient-windows',
			message: 'At least 2 windows are required for merging',
		});
	}

	return executeMerge(windows, deps);
};
