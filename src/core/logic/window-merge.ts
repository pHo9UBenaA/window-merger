/**
 * Pure business logic for window merging.
 * Contains domain rules, validation, and decision-making without side effects.
 */

import type { Result } from '../../foundation/result';
import { failure, success } from '../../foundation/result';
import {
	type MergeError,
	type MergeResult,
	TARGET_WINDOW_TYPE,
	type WindowSnapshot,
} from '../types/window-merge';

/**
 * Sorts windows by merge target priority.
 * Priority order:
 * 1. Focused window (user's current active window)
 * 2. Older windows by creation order (window ID ascending: older → newer)
 * @param a - First window to compare.
 * @param b - Second window to compare.
 * @returns Sort order (-1, 0, or 1).
 */
export const compareWindowsByTargetPriority = (a: WindowSnapshot, b: WindowSnapshot): number => {
	if (a.focused && !b.focused) {
		return -1;
	}

	if (!a.focused && b.focused) {
		return 1;
	}

	return a.id.value - b.id.value;
};

/**
 * Plans a merge operation from multiple windows.
 * Pure function that determines the merge strategy without executing it.
 * @param windows - Windows to merge (at least 2 required).
 * @returns Result containing merge plan (or null if skipped) or error.
 */
export const planMerge = (
	windows: readonly WindowSnapshot[]
): Result<MergeResult | null, MergeError> => {
	if (windows.length <= 1) {
		return success(null);
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

/**
 * Checks if a window has any tabs.
 * @param window - Window to check.
 * @returns True if window has at least one tab.
 */
export const hasValidTabs = (window: WindowSnapshot): boolean => {
	return window.tabs.length > 0;
};

/**
 * Filters windows by incognito status and target type.
 * @param windows - Chrome windows.
 * @param incognito - Incognito mode to filter by.
 * @returns Array of valid windows matching the criteria.
 */
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
