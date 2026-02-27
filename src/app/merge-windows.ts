/**
 * Application use case: Merge Windows.
 * Pure orchestration logic that coordinates domain logic and ports.
 */

import { filterWindows, planMerge } from '../core/logic/window-merge';
import type {
	GroupId,
	MergeError,
	MergeResult,
	MoveToWindow,
	TabId,
	TabSnapshot,
	WindowId,
	WindowSnapshot,
} from '../core/types/window-merge';
import type { Result } from '../foundation/result';
import { success } from '../foundation/result';
import type { TabPort } from '../ports/tab';
import type { TabGroupPort } from '../ports/tab-group';
import type { WindowPort } from '../ports/window';

/**
 * Move index for appending tabs/groups at the end of the target window.
 */
const APPEND_TO_END_INDEX = -1;

/**
 * Dependencies required by the merge windows use case.
 */
export type MergeWindowsDeps = {
	readonly windowPort: WindowPort;
	readonly tabPort: TabPort;
	readonly tabGroupPort: TabGroupPort;
};

/**
 * Collects unique group IDs from tabs.
 * @param tabs - Source tabs.
 * @returns Unique group IDs.
 */
const collectGroupIds = (tabs: readonly TabSnapshot[]): readonly GroupId[] => {
	const groupIds: GroupId[] = [];
	const seen = new Set<number>();

	for (const tab of tabs) {
		if (tab.groupId === null) {
			continue;
		}

		if (seen.has(tab.groupId.value)) {
			continue;
		}

		seen.add(tab.groupId.value);
		groupIds.push(tab.groupId);
	}

	return groupIds;
};

/**
 * Collects tab IDs from tabs matched by predicate.
 * @param tabs - Source tabs.
 * @param predicate - Selection predicate.
 * @returns Selected tab IDs.
 */
const collectTabIds = (
	tabs: readonly TabSnapshot[],
	predicate: (tab: TabSnapshot) => boolean
): readonly TabId[] => {
	return tabs.filter(predicate).map((tab) => tab.id);
};

/**
 * Moves tabs from a source window to the target window.
 * Preserves tab groups, pinning, and muting.
 * @param tabs - Tabs from source window.
 * @param targetWindowId - Destination window ID.
 * @param deps - Port dependencies.
 */
const moveTabsToTarget = async (
	tabs: readonly TabSnapshot[],
	targetWindowId: WindowId,
	deps: MergeWindowsDeps
): Promise<void> => {
	const moveProperties: MoveToWindow = { windowId: targetWindowId, index: APPEND_TO_END_INDEX };

	const groupIds = collectGroupIds(tabs);
	if (groupIds.length > 0) {
		await Promise.all(
			groupIds.map((groupId) => deps.tabGroupPort.moveGroup(groupId, moveProperties))
		);
	}

	const ungroupedTabIds = collectTabIds(tabs, (tab) => tab.groupId === null);
	if (ungroupedTabIds.length > 0) {
		await deps.tabPort.moveTabs(ungroupedTabIds, moveProperties);
	}

	const pinnedTabIds = collectTabIds(tabs, (tab) => tab.pinned);
	const mutedTabIds = collectTabIds(tabs, (tab) => tab.muted);

	const pinTasks = pinnedTabIds.map((tabId) => deps.tabPort.updateTab(tabId, { pinned: true }));
	const muteTasks = mutedTabIds.map((tabId) => deps.tabPort.updateTab(tabId, { muted: true }));

	if (pinTasks.length > 0 || muteTasks.length > 0) {
		await Promise.all([...pinTasks, ...muteTasks]);
	}
};

/**
 * Executes the merge operation.
 * @param windows - Windows to merge.
 * @param deps - Port dependencies.
 * @returns Merge result or error.
 */
const executeMerge = async (
	windows: readonly WindowSnapshot[],
	deps: MergeWindowsDeps
): Promise<Result<MergeResult | null, MergeError>> => {
	const mergePlan = planMerge(windows);
	if (!mergePlan.ok || mergePlan.data === null) {
		return mergePlan;
	}

	const mergeResult = mergePlan.data;
	const sourceWindows = windows.filter(
		(window) => window.id.value !== mergeResult.targetWindowId.value
	);

	for (const sourceWindow of sourceWindows) {
		await moveTabsToTarget(sourceWindow.tabs, mergeResult.targetWindowId, deps);
	}

	await deps.tabPort.updateTab(mergeResult.activeTabId, { active: true });
	return success(mergeResult);
};

/**
 * Merges all windows with the specified incognito mode.
 * @param incognito - Whether to merge incognito or regular windows.
 * @param deps - Injected port dependencies.
 * @returns Result containing MergeResult (or null if skipped) or error.
 */
export const mergeWindows = async (
	incognito: boolean,
	deps: MergeWindowsDeps
): Promise<Result<MergeResult | null, MergeError>> => {
	const windows = filterWindows(await deps.windowPort.getAllWindows(true), incognito);
	if (windows.length <= 1) {
		return success(null);
	}

	return executeMerge(windows, deps);
};
