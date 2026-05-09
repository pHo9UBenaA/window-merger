import { describe, expect, it } from 'vitest';
import {
	compareWindowsByTargetPriority,
	filterWindows,
	hasValidTabs,
	planMerge,
} from '../../../src/domain/window-merge';
import {
	createTabId,
	createWindowId,
	TARGET_WINDOW_TYPE,
	type TabSnapshot,
	type WindowId,
	type WindowSnapshot,
} from '../../../src/domain/window-merge.types';

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

const createValidWindowId = (id: number): WindowId => {
	const windowId = createWindowId(id);
	if (windowId === null) {
		throw new Error(`Invalid window id in test: ${id}`);
	}

	return windowId;
};

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
	describe('compareWindowsByTargetPriority', () => {
		it('prioritizes focused window over non-focused window', () => {
			const focused = createWindowSnapshot(1, [], { focused: true });
			const notFocused = createWindowSnapshot(2);

			expect(compareWindowsByTargetPriority(focused, notFocused)).toBeLessThan(0);
			expect(compareWindowsByTargetPriority(notFocused, focused)).toBeGreaterThan(0);
		});

		it('prioritizes window with lower ID when neither is focused', () => {
			const olderWindow = createWindowSnapshot(1);
			const newerWindow = createWindowSnapshot(5);

			expect(compareWindowsByTargetPriority(olderWindow, newerWindow)).toBeLessThan(0);
			expect(compareWindowsByTargetPriority(newerWindow, olderWindow)).toBeGreaterThan(0);
		});

		it('prioritizes focused window regardless of window ID order', () => {
			const focusedNewer = createWindowSnapshot(5, [], { focused: true });
			const notFocusedOlder = createWindowSnapshot(1);

			expect(compareWindowsByTargetPriority(focusedNewer, notFocusedOlder)).toBeLessThan(0);
		});
	});

	describe('hasValidTabs', () => {
		it('returns true when window has at least one tab', () => {
			const window = createWindowSnapshot(1, [createTabSnapshot(1), createTabSnapshot(2)]);
			expect(hasValidTabs(window)).toBe(true);
		});

		it('returns false when window has no tabs', () => {
			const window = createWindowSnapshot(1, []);
			expect(hasValidTabs(window)).toBe(false);
		});
	});

	describe('filterWindows', () => {
		it('excludes incognito, popup, and tabless windows', () => {
			const windows = [
				createWindowSnapshot(1, [createTabSnapshot(1)]),
				createWindowSnapshot(2, [createTabSnapshot(2)], { incognito: true }),
				createWindowSnapshot(3, [createTabSnapshot(3)], { type: 'popup' }),
				createWindowSnapshot(4, []),
			];

			const result = filterWindows(windows, false);
			expect(result).toEqual([windows[0]]);
		});

		it('excludes windows with an ID value less than 1', () => {
			const invalidWindow: WindowSnapshot = {
				...createWindowSnapshot(1, [createTabSnapshot(1)]),
				id: { kind: 'WindowId', value: 0 } as const,
			};
			const validWindow = createWindowSnapshot(2, [createTabSnapshot(2)]);

			const result = filterWindows([invalidWindow, validWindow], false);

			expect(result).toEqual([validWindow]);
		});
	});

	describe('planMerge', () => {
		it('returns target window ID and active tab ID when merge is possible', () => {
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

		it('returns no-valid-target error when target window has an invalid ID', () => {
			const invalidTargetWindow = {
				...createWindowSnapshot(1, [createTabSnapshot(1, { active: true })], {
					focused: true,
				}),
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

		it('returns no-active-tab error when no tab is marked active', () => {
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

		it('returns insufficient-windows error when window list is empty', () => {
			const result = planMerge([]);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.type).toBe('insufficient-windows');
				expect(result.error.context.windowCount).toBe(0);
			}
		});

		it('finds active tab from a later source window', () => {
			const target = createWindowSnapshot(1, [createTabSnapshot(1, { active: false })], {
				focused: true,
			});
			const source1 = createWindowSnapshot(2, [createTabSnapshot(2, { active: false })]);
			const source2 = createWindowSnapshot(3, [createTabSnapshot(3, { active: true })]);

			const result = planMerge([target, source1, source2]);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.activeTabId).toEqual(createTabSnapshot(3).id);
			}
		});
	});
});
