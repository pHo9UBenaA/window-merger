/**
 * Tests for core domain logic (pure functions).
 */

import { describe, expect, it } from 'vitest';
import {
	compareWindowsByTargetPriority,
	filterWindows,
	hasValidTabs,
	planMerge,
} from '../../../src/core/logic/window-merge';
import {
	createTabId,
	createWindowId,
	TARGET_WINDOW_TYPE,
	type TabSnapshot,
	type WindowId,
	type WindowSnapshot,
} from '../../../src/core/types/window-merge';

/**
 * Creates a tab snapshot for tests.
 * @param id - Numeric tab ID.
 * @param options - Optional overrides.
 * @returns Tab snapshot.
 */
const createTabSnapshot = (
	id: number,
	options: Partial<Omit<TabSnapshot, 'id'>> = {}
): TabSnapshot => {
	const tabId = createTabId(id);
	if (tabId === null) {
		throw new Error(`Invalid tab id in test: ${id}`);
	}

	return {
		id: tabId,
		groupId: null,
		pinned: false,
		muted: false,
		active: false,
		...options,
	};
};

/**
 * Creates a valid window ID for tests.
 * @param id - Numeric window ID.
 * @returns Window ID.
 */
const createValidWindowId = (id: number): WindowId => {
	const windowId = createWindowId(id);
	if (windowId === null) {
		throw new Error(`Invalid window id in test: ${id}`);
	}

	return windowId;
};

/**
 * Creates a window snapshot for tests.
 * @param id - Numeric window ID.
 * @param tabs - Tab list.
 * @param options - Optional overrides.
 * @returns Window snapshot.
 */
const createWindowSnapshot = (
	id: number,
	tabs: readonly TabSnapshot[] = [],
	options: Partial<WindowSnapshot> = {}
): WindowSnapshot => {
	return {
		id: createValidWindowId(id),
		incognito: false,
		focused: false,
		type: TARGET_WINDOW_TYPE,
		tabs,
		...options,
	};
};

describe('Core Logic - Window Merge', () => {
	it('compareWindowsByTargetPriority: prioritizes focused window', () => {
		const focused = createWindowSnapshot(1, [], { focused: true });
		const notFocused = createWindowSnapshot(2);

		expect(compareWindowsByTargetPriority(focused, notFocused)).toBe(-1);
		expect(compareWindowsByTargetPriority(notFocused, focused)).toBe(1);
	});

	it('compareWindowsByTargetPriority: prioritizes older windows by ID (creation order)', () => {
		const olderWindow = createWindowSnapshot(1);
		const newerWindow = createWindowSnapshot(5);

		expect(compareWindowsByTargetPriority(olderWindow, newerWindow)).toBe(-4);
		expect(compareWindowsByTargetPriority(newerWindow, olderWindow)).toBe(4);
	});

	it('compareWindowsByTargetPriority: focused takes priority over creation order', () => {
		const focusedNewer = createWindowSnapshot(5, [], { focused: true });
		const notFocusedOlder = createWindowSnapshot(1);

		expect(compareWindowsByTargetPriority(focusedNewer, notFocusedOlder)).toBe(-1);
	});

	it('hasValidTabs: returns true for windows with tabs', () => {
		const window = createWindowSnapshot(1, [createTabSnapshot(1), createTabSnapshot(2)]);
		expect(hasValidTabs(window)).toBe(true);
	});

	it('hasValidTabs: returns false for windows without tabs', () => {
		const window = createWindowSnapshot(1, []);
		expect(hasValidTabs(window)).toBe(false);
	});

	it('filterWindows: returns only valid windows by incognito, type and tab presence', () => {
		const windows = [
			createWindowSnapshot(1, [createTabSnapshot(1)]),
			createWindowSnapshot(2, [createTabSnapshot(2)], { incognito: true }),
			createWindowSnapshot(3, [createTabSnapshot(3)], { type: 'popup' }),
			createWindowSnapshot(4, []),
		];

		const result = filterWindows(windows, false);
		expect(result).toEqual([windows[0]]);
	});

	it('planMerge: plans merge for multiple windows', () => {
		const window1 = createWindowSnapshot(1, [createTabSnapshot(1, { active: true })], {
			focused: true,
		});
		const window2 = createWindowSnapshot(2, [createTabSnapshot(2, { active: false })]);

		const result = planMerge([window1, window2]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual({
				targetWindowId: createValidWindowId(1),
				activeTabId: createTabSnapshot(1).id,
			});
		}
	});

	it('planMerge: returns error when target window has no valid ID', () => {
		const invalidTargetWindow = {
			...createWindowSnapshot(1, [createTabSnapshot(1, { active: true })], { focused: true }),
			id: {
				kind: 'WindowId',
				value: 0,
			} as const,
		};
		const window2 = createWindowSnapshot(2, [createTabSnapshot(2, { active: false })]);

		const result = planMerge([invalidTargetWindow, window2]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('no-valid-target');
			expect(result.error.context.windowCount).toBe(2);
		}
	});

	it('planMerge: returns error when no active tab found', () => {
		const window1 = createWindowSnapshot(1, [createTabSnapshot(1, { active: false })], {
			focused: true,
		});
		const window2 = createWindowSnapshot(2, [createTabSnapshot(2, { active: false })]);

		const result = planMerge([window1, window2]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('no-active-tab');
			expect(result.error.context.windowCount).toBe(2);
		}
	});
});
