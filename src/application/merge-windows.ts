import { filterWindows, planMerge } from '../domain/window-merge';
import type {
	GroupId,
	MergeError,
	MergeResult,
	MoveToWindow,
	TabId,
	TabSnapshot,
	WindowId,
	WindowSnapshot,
} from '../domain/window-merge.types';
import type { TabPort } from '../ports/tab';
import type { TabGroupPort } from '../ports/tab-group';
import type { WindowPort } from '../ports/window';
import type { Result } from '../shared/result';
import { failure, success } from '../shared/result';

const APPEND_TO_END_INDEX = -1;

export type MergeWindowsDeps = {
	readonly windowPort: WindowPort;
	readonly tabPort: TabPort;
	readonly tabGroupPort: TabGroupPort;
};

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

const collectTabIds = (
	tabs: readonly TabSnapshot[],
	predicate: (tab: TabSnapshot) => boolean
): readonly TabId[] => {
	return tabs.filter(predicate).map((tab) => tab.id);
};

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

const executeMerge = async (
	windows: readonly WindowSnapshot[],
	deps: MergeWindowsDeps
): Promise<Result<MergeResult, MergeError>> => {
	const mergePlan = planMerge(windows);
	if (!mergePlan.ok) {
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

export const mergeWindows = async (
	incognito: boolean,
	deps: MergeWindowsDeps
): Promise<Result<MergeResult, MergeError>> => {
	const windows = filterWindows(await deps.windowPort.getAllWindows(true), incognito);
	if (windows.length <= 1) {
		return failure({
			type: 'insufficient-windows',
			message: 'Not enough windows to merge',
			context: { windowCount: windows.length },
		});
	}

	return executeMerge(windows, deps);
};
