/**
 * Tests for core domain logic (pure functions).
 * These tests verify business rules without any Chrome API dependencies.
 */

import { describe, expect, it } from 'vitest';
import {
	compareWindowsByTargetPriority,
	hasValidTabs,
	planMerge,
} from '../../../src/core/logic/window-merge';

describe('Core Logic - Window Merge', () => {
	it('compareWindowsByTargetPriority: prioritizes focused window', () => {
		const focused = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: true,
			state: 'normal',
			tabs: [],
		} as unknown as chrome.windows.Window;
		const notFocused = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [],
		} as unknown as chrome.windows.Window;

		expect(compareWindowsByTargetPriority(focused, notFocused)).toBe(-1);
		expect(compareWindowsByTargetPriority(notFocused, focused)).toBe(1);
	});

	it('compareWindowsByTargetPriority: prioritizes normal/maximized over minimized', () => {
		const normal = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [],
		} as unknown as chrome.windows.Window;
		const minimized = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'minimized',
			tabs: [],
		} as unknown as chrome.windows.Window;

		expect(compareWindowsByTargetPriority(normal, minimized)).toBe(-1);
		expect(compareWindowsByTargetPriority(minimized, normal)).toBe(1);
	});

	it('compareWindowsByTargetPriority: focused takes priority over state', () => {
		const focusedMinimized = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: true,
			state: 'minimized',
			tabs: [],
		} as unknown as chrome.windows.Window;
		const notFocusedNormal = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [],
		} as unknown as chrome.windows.Window;

		expect(compareWindowsByTargetPriority(focusedMinimized, notFocusedNormal)).toBe(-1);
	});

	it('hasValidTabs: returns true for windows with tabs', () => {
		const window = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [
				{ id: 1, groupId: -1, pinned: false } as chrome.tabs.Tab,
				{ id: 2, groupId: -1, pinned: false } as chrome.tabs.Tab,
			],
		} as unknown as chrome.windows.Window;

		expect(hasValidTabs(window)).toBe(true);
	});

	it('hasValidTabs: returns false for windows without tabs', () => {
		const window = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [],
		} as unknown as chrome.windows.Window;

		expect(hasValidTabs(window)).toBe(false);
	});

	it('planMerge: returns error for single window', () => {
		const window = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [{ id: 1, active: true } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;

		const result = planMerge([window]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('insufficient-windows');
		}
	});

	it('planMerge: plans merge for multiple windows', () => {
		const window1 = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: true,
			state: 'normal',
			tabs: [{ id: 1, active: true } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;
		const window2 = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [{ id: 2, active: true } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;

		const result = planMerge([window1, window2]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual({
				targetWindowId: 1,
				activeTabId: 1,
			});
		}
	});

	it('planMerge: returns error when target window has no valid ID', () => {
		const window1 = {
			id: undefined,
			incognito: false,
			type: 'normal',
			focused: true,
			state: 'normal',
			tabs: [{ id: 1, active: true } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;
		const window2 = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [{ id: 2, active: true } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;

		const result = planMerge([window1, window2]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('no-valid-target');
		}
	});

	it('planMerge: returns error when no active tab found', () => {
		const window1 = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: true,
			state: 'normal',
			tabs: [{ id: 1, active: false } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;
		const window2 = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			state: 'normal',
			tabs: [{ id: 2, active: false } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;

		const result = planMerge([window1, window2]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('no-active-tab');
		}
	});
});
