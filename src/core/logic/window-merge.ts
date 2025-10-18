/**
 * Pure business logic for window merging.
 * Contains domain rules, validation, and decision-making without side effects.
 */

import type { Result } from '../../foundation/result';
import { failure, success } from '../../foundation/result';
import { type MergeError, type MergeResult, TARGET_WINDOW_TYPE } from '../types/window-merge';

/**
 * Sorts windows by merge target priority.
 * Priority order:
 * 1. Focused window (user's current active window)
 * 2. Older windows by creation order (window ID ascending: older → newer)
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

	// Next priority: older windows by creation order (ID ascending)
	const aId = a.id ?? Number.MAX_SAFE_INTEGER;
	const bId = b.id ?? Number.MAX_SAFE_INTEGER;

	return aId - bId;
};

/**
 * Plans a merge operation from multiple windows.
 * Pure function that determines the merge strategy without executing it.
 * @param windows - Windows to merge (at least 2 required).
 * @returns Result containing merge plan (or null if skipped) or error.
 */
export const planMerge = (
	windows: readonly chrome.windows.Window[]
): Result<MergeResult | null, MergeError> => {
	if (windows.length <= 1) {
		return success(null);
	}

	const sorted = [...windows].sort(compareWindowsByTargetPriority);
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

	// Fallback: Search source windows for active tab
	// Note: This fallback is extremely defensive and should rarely (if ever) be reached.
	// It protects against exceptional edge cases such as:
	// - Race conditions during window state transitions
	// - Chrome API inconsistencies or bugs
	// - Future Chrome behavior changes
	// By checking source windows, we ensure the best user experience even in unexpected scenarios.
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

/**
 * Filters windows by incognito status and target type.
 * @param windows - Chrome windows.
 * @param incognito - Incognito mode to filter by.
 * @returns Array of valid windows matching the criteria.
 */
export const filterWindows = (
	windows: readonly chrome.windows.Window[],
	incognito: boolean
): chrome.windows.Window[] => {
	return windows.filter((window) => {
		// Incognito mode check
		if (window.incognito !== incognito) {
			return false;
		}

		// Type check
		if (window.type !== TARGET_WINDOW_TYPE) {
			return false;
		}

		// Must have valid ID
		if (typeof window.id !== 'number') {
			return false;
		}

		// Must have tabs
		if (!hasValidTabs(window)) {
			return false;
		}

		return true;
	});
};
