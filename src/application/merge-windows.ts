import { filterWindows, planMerge, planTabMoves } from '../domain/window-merge';
import type {
	GroupId,
	MergeError,
	MergeResult,
	MoveToWindow,
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

const moveTabsToTarget = async (
	tabs: readonly TabSnapshot[],
	windowId: WindowId,
	deps: MergeWindowsDeps
): Promise<void> => {
	const destination: MoveToWindow = { windowId, index: -1 };
	for (const move of planTabMoves(tabs)) {
		switch (move.type) {
			case 'pinned':
				await deps.tabPort.moveTabs([move.tabId], destination);
				// Cross-window moves unpin tabs; repinning appends to the pinned section.
				await deps.tabPort.updateTab(move.tabId, { pinned: true });
				break;
			case 'tabs':
				await deps.tabPort.moveTabs(move.tabIds, destination);
				break;
			case 'group':
				await deps.tabGroupPort.moveGroup(move.groupId, destination);
				break;
		}
	}
	for (const tab of tabs) {
		if (tab.muted) await deps.tabPort.updateTab(tab.id, { muted: true });
	}
};

export const mergeWindows = async (
	incognito: boolean,
	deps: MergeWindowsDeps,
	preferredTargetWindowId?: WindowId
): Promise<Result<MergeResult, MergeError>> => {
	const windows = filterWindows(await deps.windowPort.getAllWindows(), incognito);
	const plan = planMerge(windows, preferredTargetWindowId);
	if (!plan.ok) return plan;

	// Removing a source's last ungrouped tab can activate and expand its remaining group.
	// Capture every group's state before any moves, including groups already in the target.
	const groups = new Map<number, { id: GroupId; collapsed: boolean }>();
	for (const window of windows) {
		for (const tab of window.tabs) {
			if (tab.groupId === null || groups.has(tab.groupId.value)) continue;
			groups.set(tab.groupId.value, {
				id: tab.groupId,
				collapsed: await deps.tabGroupPort.getCollapsed(tab.groupId),
			});
		}
	}

	const { targetWindowId, activeTabId } = plan.data;
	for (const window of windows.toSorted((a, b) => a.id.value - b.id.value)) {
		if (window.id.value === targetWindowId.value) continue;
		await moveTabsToTarget(window.tabs, targetWindowId, deps);
	}
	await deps.tabPort.updateTab(activeTabId, { active: true });
	for (const group of groups.values()) {
		await deps.tabGroupPort.setCollapsed(group.id, group.collapsed);
	}
	return plan;
};
