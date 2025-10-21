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
			tabs: [],
		} as unknown as chrome.windows.Window;
		const notFocused = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			tabs: [],
		} as unknown as chrome.windows.Window;

		expect(compareWindowsByTargetPriority(focused, notFocused)).toBe(-1);
		expect(compareWindowsByTargetPriority(notFocused, focused)).toBe(1);
	});

	it('compareWindowsByTargetPriority: prioritizes older windows by ID (creation order)', () => {
		const olderWindow = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: false,
			tabs: [],
		} as unknown as chrome.windows.Window;
		const newerWindow = {
			id: 5,
			incognito: false,
			type: 'normal',
			focused: false,
			tabs: [],
		} as unknown as chrome.windows.Window;

		expect(compareWindowsByTargetPriority(olderWindow, newerWindow)).toBe(-4);
		expect(compareWindowsByTargetPriority(newerWindow, olderWindow)).toBe(4);
	});

	it('compareWindowsByTargetPriority: focused takes priority over creation order', () => {
		const focusedNewer = {
			id: 5,
			incognito: false,
			type: 'normal',
			focused: true,
			tabs: [],
		} as unknown as chrome.windows.Window;
		const notFocusedOlder = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: false,
			tabs: [],
		} as unknown as chrome.windows.Window;

		expect(compareWindowsByTargetPriority(focusedNewer, notFocusedOlder)).toBe(-1);
	});

	it('hasValidTabs: returns true for windows with tabs', () => {
		const window = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: false,
			tabs: [
				{ id: 1, groupId: -1, pinned: false } as chrome.tabs.Tab,
				{ id: 2, groupId: -1, pinned: false } as chrome.tabs.Tab,
			],
		} as unknown as chrome.windows.Window;

		expect(hasValidTabs(window)).toBe(true);
	});

	it('hasValidTabs: returns false for windows without tabs', () => {
		const window = { id: 1, tabs: undefined } as unknown as chrome.windows.Window;
		expect(hasValidTabs(window)).toBe(false);
	});

	it('planMerge: plans merge for multiple windows', () => {
		const window1 = {
			id: 1,
			incognito: false,
			type: 'normal',
			focused: true,
			tabs: [{ id: 1, active: true } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;
		const window2 = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
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
			tabs: [{ id: 1, active: true } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;
		const window2 = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
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
			tabs: [{ id: 1, active: false } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;
		const window2 = {
			id: 2,
			incognito: false,
			type: 'normal',
			focused: false,
			tabs: [{ id: 2, active: false } as chrome.tabs.Tab],
		} as unknown as chrome.windows.Window;

		const result = planMerge([window1, window2]);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('no-active-tab');
		}
	});
});
