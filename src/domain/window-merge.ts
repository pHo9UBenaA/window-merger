// Pure business logic. No side effects, no platform imports — keep this module
// independent of chrome.* and other I/O so it stays trivially testable.

import type { Result } from '../shared/result';
import { failure, success } from '../shared/result';
import {
	type GroupId,
	isValidId,
	type MergeError,
	type MergeResult,
	TARGET_WINDOW_TYPE,
	type TabId,
	type TabSnapshot,
	type WindowId,
	type WindowSnapshot,
} from './window-merge.types';

// Prefer the focused window; use the ID as a stable tie-breaker otherwise.
export const compareWindowsByTargetPriority = (a: WindowSnapshot, b: WindowSnapshot): number => {
	if (a.focused && !b.focused) {
		return -1;
	}

	if (!a.focused && b.focused) {
		return 1;
	}

	return a.id.value - b.id.value;
};

// Order windows by ID; `chrome.windows.getAll` gives no ordering guarantee of its own.
export const compareWindowsById = (a: WindowSnapshot, b: WindowSnapshot): number =>
	a.id.value - b.id.value;

export const planMerge = (
	windows: readonly WindowSnapshot[],
	preferredTargetWindowId?: WindowId
): Result<MergeResult, MergeError> => {
	if (windows.length <= 1) {
		return failure({
			type: 'insufficient-windows',
			message: 'Not enough windows to merge',
			context: { windowCount: windows.length },
		});
	}

	const targetWindow =
		windows.find((window) => window.id.value === preferredTargetWindowId?.value) ??
		windows.toSorted(compareWindowsByTargetPriority)[0];
	const sourceWindows = windows
		.filter((window) => window.id.value !== targetWindow.id.value)
		.toSorted(compareWindowsById);
	if (!isValidId(targetWindow.id.value)) {
		return failure({
			type: 'no-valid-target',
			message: 'Target window does not have a valid ID',
			context: {
				windowCount: windows.length,
			},
		});
	}

	let activeTabId = targetWindow.tabs.find((tab) => tab.active)?.id;
	if (activeTabId === undefined) {
		for (const window of sourceWindows) {
			activeTabId = window.tabs.find((tab) => tab.active)?.id;
			if (activeTabId !== undefined) {
				break;
			}
		}
	}

	if (activeTabId === undefined) {
		return failure({
			type: 'no-active-tab',
			message: 'No active tab found in any window',
			context: {
				windowCount: windows.length,
			},
		});
	}

	return success({
		targetWindowId: targetWindow.id,
		activeTabId,
	});
};

export type TabMove =
	| { readonly type: 'pinned'; readonly tabId: TabId }
	| { readonly type: 'tabs'; readonly tabIds: TabId[] }
	| { readonly type: 'group'; readonly groupId: GroupId };

export const planTabMoves = (tabs: readonly TabSnapshot[]): readonly TabMove[] => {
	const moves: TabMove[] = [];
	const groups = new Set<number>();
	for (const tab of tabs.toSorted((a, b) => a.index - b.index)) {
		if (tab.pinned) {
			moves.push({ type: 'pinned', tabId: tab.id });
		} else if (tab.groupId !== null) {
			if (groups.has(tab.groupId.value)) continue;
			groups.add(tab.groupId.value);
			moves.push({ type: 'group', groupId: tab.groupId });
		} else {
			const previous = moves.at(-1);
			if (previous?.type === 'tabs') previous.tabIds.push(tab.id);
			else moves.push({ type: 'tabs', tabIds: [tab.id] });
		}
	}
	return moves;
};

export const hasValidTabs = (window: WindowSnapshot): boolean => {
	return window.tabs.length > 0;
};

export const filterWindows = (
	windows: readonly WindowSnapshot[],
	incognito: boolean
): WindowSnapshot[] => {
	return windows.filter((window) => {
		if (window.incognito !== incognito) {
			return false;
		}

		if (window.type !== TARGET_WINDOW_TYPE) {
			return false;
		}

		if (!isValidId(window.id.value)) {
			return false;
		}

		if (!hasValidTabs(window)) {
			return false;
		}

		return true;
	});
};
