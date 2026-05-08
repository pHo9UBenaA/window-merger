// Pure business logic. No side effects, no platform imports — keep this module
// independent of chrome.* and other I/O so it stays trivially testable.

import type { Result } from '../shared/result';
import { failure, success } from '../shared/result';
import {
	type MergeError,
	type MergeResult,
	TARGET_WINDOW_TYPE,
	type WindowSnapshot,
} from './window-merge.types';

// Priority: focused window first, then older windows (smaller ID = created earlier).
export const compareWindowsByTargetPriority = (a: WindowSnapshot, b: WindowSnapshot): number => {
	if (a.focused && !b.focused) {
		return -1;
	}

	if (!a.focused && b.focused) {
		return 1;
	}

	return a.id.value - b.id.value;
};

export const planMerge = (windows: readonly WindowSnapshot[]): Result<MergeResult, MergeError> => {
	if (windows.length <= 1) {
		return failure({
			type: 'insufficient-windows',
			message: 'Not enough windows to merge',
			context: { windowCount: windows.length },
		});
	}

	const [targetWindow, ...sourceWindows] = [...windows].sort(compareWindowsByTargetPriority);
	if (targetWindow.id.value < 1) {
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

		if (window.id.value < 1) {
			return false;
		}

		if (!hasValidTabs(window)) {
			return false;
		}

		return true;
	});
};
