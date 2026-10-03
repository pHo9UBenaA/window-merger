// Pure business logic. No side effects, no platform imports — keep this module
// independent of chrome.* and other I/O so it stays trivially testable.

import type { Result } from '../shared/result';
import { failure, success } from '../shared/result';
import {
	isValidId,
	type MergeError,
	type MergeResult,
	TARGET_WINDOW_TYPE,
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

export const planMerge = (windows: readonly WindowSnapshot[]): Result<MergeResult, MergeError> => {
	if (windows.length <= 1) {
		return failure({
			type: 'insufficient-windows',
			message: 'Not enough windows to merge',
			context: { windowCount: windows.length },
		});
	}

	const prioritizedWindows = windows.toSorted(compareWindowsByTargetPriority);
	const [targetWindow] = prioritizedWindows;
	if (!isValidId(targetWindow.id.value)) {
		return failure({
			type: 'no-valid-target',
			message: 'Target window does not have a valid ID',
			context: {
				windowCount: windows.length,
			},
		});
	}

	for (const window of prioritizedWindows) {
		const activeTabId = window.tabs.find((tab) => tab.active)?.id;
		if (activeTabId === undefined) continue;
		return success({ targetWindowId: targetWindow.id, activeTabId });
	}

	return failure({
		type: 'no-active-tab',
		message: 'No active tab found in any window',
		context: {
			windowCount: windows.length,
		},
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

		if (!isValidId(window.id.value)) {
			return false;
		}

		if (!hasValidTabs(window)) {
			return false;
		}

		return true;
	});
};
