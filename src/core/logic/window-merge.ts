/**
 * Pure business logic for window merging.
 * Contains domain rules, validation, and decision-making without side effects.
 */

import { sortBy } from '../../foundation/array';
import type { Result } from '../../foundation/result';
import { failure, success } from '../../foundation/result';
import type { MergeError, MergeResult } from '../types/window-merge';

/**
 * Sorts windows by merge target priority.
 * Priority order:
 * 1. Focused window (user's current active window)
 * 2. Windows in normal or maximized state (over minimized)
 * @param a - First window to compare.
 * @param b - Second window to compare.
 * @returns Sort order (-1, 0, or 1).
 */
export const compareWindowsByTargetPriority = (
	a: chrome.windows.Window,
	b: chrome.windows.Window
): number => {
	// Focused window takes highest priority
	const aFocused = a.focused ?? false;
	const bFocused = b.focused ?? false;
	if (aFocused && !bFocused) return -1;
	if (!aFocused && bFocused) return 1;

	// Next priority: normal/maximized over minimized
	const aState = a.state ?? 'normal';
	const bState = b.state ?? 'normal';
	const aPreferredState = aState === 'normal' || aState === 'maximized';
	const bPreferredState = bState === 'normal' || bState === 'maximized';

	if (aPreferredState && !bPreferredState) return -1;
	if (!aPreferredState && bPreferredState) return 1;

	return 0;
};

/**
 * Plans a merge operation from multiple windows.
 * Pure function that determines the merge strategy without executing it.
 * @param windows - Windows to merge (at least 2 required).
 * @returns Result containing merge plan or error.
 */
export const planMerge = (
	windows: readonly chrome.windows.Window[]
): Result<MergeResult, MergeError> => {
	if (windows.length <= 1) {
		return failure({
			type: 'insufficient-windows',
			message: 'At least 2 windows are required for merging',
		});
	}

	const sorted = sortBy(windows, compareWindowsByTargetPriority);
	const [targetWindow, ...sourceWindows] = sorted;

	// Validate target window has ID
	if (typeof targetWindow.id !== 'number') {
		return failure({
			type: 'no-valid-target',
			message: 'Target window does not have a valid ID',
		});
	}

	// Find active tab - first check target window, then source windows
	let activeTabId = (targetWindow.tabs ?? []).find((t) => t.active)?.id;

	if (typeof activeTabId !== 'number') {
		for (const window of sourceWindows) {
			activeTabId = (window.tabs ?? []).find((t) => t.active)?.id;
			if (typeof activeTabId === 'number') {
				break;
			}
		}
	}

	if (typeof activeTabId !== 'number') {
		return failure({
			type: 'no-active-tab',
			message: 'No active tab found in any window',
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
export const hasValidTabs = (window: chrome.windows.Window): boolean => {
	const tabs = window.tabs ?? [];
	return tabs.length > 0;
};
