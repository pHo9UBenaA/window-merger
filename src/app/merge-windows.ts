/**
 * Application use case: Merge Windows
 * Pure orchestration logic that coordinates domain logic and port capabilities.
 * No direct Chrome API dependencies - only uses injected port interfaces.
 */

import { filterWindows, planMerge } from '../core/logic/window-merge';
import type { MergeError, MergeResult } from '../core/types/window-merge';
import type { Result } from '../foundation/result';
import { success } from '../foundation/result';
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
	// Moves tab to target window at the end
	const moveProperties = { windowId: targetWindowId, index: -1 };

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

	// Move grouped tabs first
	if (groupIds.length > 0) {
		await Promise.all(
			groupIds.map((groupId) => deps.tabGroupPort.moveGroup(groupId, moveProperties))
		);
	}

	const ungroupedTabIds = tabs
		.filter(
			(tab) =>
				typeof tab.id === 'number' && (typeof tab.groupId !== 'number' || tab.groupId <= 0)
		)
		.map((tab) => tab.id as number);

	// Move ungrouped tabs
	if (ungroupedTabIds.length > 0) {
		await deps.tabPort.moveTabs(ungroupedTabIds, moveProperties);
	}

	const pinnedTabIds = tabs
		.filter((tab) => tab.pinned)
		.map((tab) => tab.id)
		.filter((id): id is number => typeof id === 'number');
	const mutedTabIds = tabs
		.filter((tab) => tab.mutedInfo?.muted === true)
		.map((tab) => tab.id)
		.filter((id): id is number => typeof id === 'number');

	const pinnedPromises = pinnedTabIds.map((tabId) =>
		deps.tabPort.updateTab(tabId, { pinned: true })
	);
	const mutedPromises = mutedTabIds.map((tabId) =>
		deps.tabPort.updateTab(tabId, { muted: true })
	);

	// Await all pinning and muting updates
	if (pinnedPromises.length || mutedPromises.length) {
		await Promise.all([...pinnedPromises, ...mutedPromises]);
	}
};

/**
 * Executes the merge operation.
 * @param windows - Windows to merge.
 * @param deps - Port dependencies.
 * @returns Result containing MergeResult (or null if skipped) or error.
 */
const executeMerge = async (
	windows: readonly chrome.windows.Window[],
	deps: MergeWindowsDeps
): Promise<Result<MergeResult | null, MergeError>> => {
	const plan = planMerge(windows);

	if (!plan.ok) {
		return plan;
	}

	if (plan.data === null) {
		return plan;
	}

	const mergeResult = plan.data;

	const sourceWindows = windows.filter((window) => window.id !== mergeResult.targetWindowId);

	// Move tabs from each source window sequentially
	for (const sourceWindow of sourceWindows) {
		await moveTabsToTarget(sourceWindow.tabs ?? [], mergeResult.targetWindowId, deps);
	}

	// Activate the determined tab
	if (typeof mergeResult.activeTabId === 'number') {
		await deps.tabPort.updateTab(mergeResult.activeTabId, { active: true });
	}

	return success(mergeResult);
};

/**
 * Merges all windows with the specified incognito mode.
 * Main entry point for the merge windows use case.
 * @param incognito - Whether to merge incognito or regular windows.
 * @param deps - Injected port dependencies.
 * @returns Result containing MergeResult (or null if skipped) or error.
 */
export const mergeWindows = async (
	incognito: boolean,
	deps: MergeWindowsDeps
): Promise<Result<MergeResult | null, MergeError>> => {
	const rawWindows = await deps.windowPort.getAllWindows(true);
	const windows = filterWindows(rawWindows, incognito);

	if (windows.length <= 1) {
		return success(null);
	}

	return executeMerge(windows, deps);
};
