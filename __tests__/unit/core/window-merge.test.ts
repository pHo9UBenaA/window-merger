import { describe, expect, it } from 'vitest';
import {
	compareWindowsByTargetPriority,
	filterWindows,
	hasValidTabs,
	planMerge,
} from '../../../src/core/window-merge';
import {
	createTabId,
	createWindowId,
	TARGET_WINDOW_TYPE,
	type TabSnapshot,
	type WindowId,
	type WindowSnapshot,
} from '../../../src/core/window-merge.types';

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

	it('planMerge: returns insufficient-windows error for empty window list', () => {
		const result = planMerge([]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('insufficient-windows');
			expect(result.error.context.windowCount).toBe(0);
		}
	});

	it('planMerge: finds active tab in later source window when earlier ones have none', () => {
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

	it('filterWindows: excludes windows whose id value is less than 1', () => {
		const invalidWindow: WindowSnapshot = {
			...createWindowSnapshot(1, [createTabSnapshot(1)]),
			id: { kind: 'WindowId', value: 0 } as const,
		};
		const validWindow = createWindowSnapshot(2, [createTabSnapshot(2)]);

		const result = filterWindows([invalidWindow, validWindow], false);

		expect(result).toEqual([validWindow]);
	});
});
