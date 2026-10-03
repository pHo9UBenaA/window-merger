import { filterWindows, planMerge } from '../domain/window-merge';
import type {
	GroupId,
	MergeError,
	MergeResult,
	MoveToWindow,
	TabId,
	TabSnapshot,
	WindowId,
} from '../domain/window-merge.types';
import type { TabPort } from '../ports/tab';
import type { TabGroupPort } from '../ports/tab-group';
import type { WindowPort } from '../ports/window';
import type { Result } from '../shared/result';

export type MergeWindowsDeps = {
	readonly windowPort: WindowPort;
	readonly tabPort: TabPort;
	readonly tabGroupPort: TabGroupPort;
};

// Keep the merge guard held until every already-started operation has settled.
const waitForAll = async (tasks: readonly Promise<void>[]): Promise<void> => {
	const results = await Promise.allSettled(tasks);
	const errors: unknown[] = [];
	for (const result of results) {
		if (result.status === 'rejected') errors.push(result.reason);
	}
	if (errors.length > 0) {
		throw new AggregateError(
			errors,
			'Chrome operations failed; some changes may have completed'
		);
	}
};

const moveTabsToTarget = async (
	tabs: readonly TabSnapshot[],
	windowId: WindowId,
	deps: MergeWindowsDeps
): Promise<void> => {
	const groups = new Map<number, GroupId>();
	const ungrouped: TabId[] = [];
	const updates: TabSnapshot[] = [];
	for (const tab of tabs) {
		if (tab.groupId === null) ungrouped.push(tab.id);
		else groups.set(tab.groupId.value, tab.groupId);
		if (tab.pinned || tab.muted) updates.push(tab);
	}

	const destination: MoveToWindow = { windowId, index: -1 };
	if (groups.size > 0) {
		await waitForAll(
			[...groups.values()].map(async (id) => deps.tabGroupPort.moveGroup(id, destination))
		);
	}
	if (ungrouped.length > 0) {
		await deps.tabPort.moveTabs(ungrouped, destination);
	}
	if (updates.length > 0) {
		await waitForAll(
			updates.map(async (tab) =>
				deps.tabPort.updateTab(tab.id, {
					...(tab.pinned && { pinned: true }),
					...(tab.muted && { muted: true }),
				})
			)
		);
	}
};

export const mergeWindows = async (
	incognito: boolean,
	deps: MergeWindowsDeps
): Promise<Result<MergeResult, MergeError>> => {
	const windows = filterWindows(await deps.windowPort.getAllWindows(), incognito);
	const plan = planMerge(windows);
	if (!plan.ok) return plan;

	const { targetWindowId, activeTabId } = plan.data;
	for (const window of windows) {
		if (window.id.value === targetWindowId.value) continue;
		await moveTabsToTarget(window.tabs, targetWindowId, deps);
	}
	await deps.tabPort.updateTab(activeTabId, { active: true });
	return plan;
};
