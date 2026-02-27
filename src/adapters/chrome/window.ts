/**
 * Chrome adapter for window operations.
 * Implements WindowPort using Chrome Windows API.
 */

import {
	createGroupId,
	createTabId,
	createWindowId,
	type TabSnapshot,
	type WindowSnapshot,
	type WindowType,
} from '../../core/types/window-merge';
import type { WindowPort } from '../../ports/window';

/**
 * Converts Chrome window type to domain window type.
 * @param type - Chrome window type.
 * @returns Domain window type.
 */
const toDomainWindowType = (type: chrome.windows.Window['type'] | undefined): WindowType => {
	switch (type) {
		case 'normal':
		case 'popup':
		case 'panel':
		case 'app':
		case 'devtools':
			return type;
		default:
			return 'unknown';
	}
};

/**
 * Type predicate for non-null values.
 * @param value - Value to test.
 * @returns Whether the value is not null.
 */
const isNotNull = <T>(value: T | null): value is T => {
	return value !== null;
};

/**
 * Converts a Chrome tab to domain tab snapshot.
 * @param tab - Chrome tab.
 * @returns Domain tab snapshot or null when ID is invalid.
 */
const toTabSnapshot = (tab: chrome.tabs.Tab): TabSnapshot | null => {
	if (typeof tab.id !== 'number') {
		return null;
	}

	const tabId = createTabId(tab.id);
	if (tabId === null) {
		return null;
	}

	const groupId = typeof tab.groupId === 'number' ? createGroupId(tab.groupId) : null;

	return {
		id: tabId,
		groupId,
		pinned: tab.pinned === true,
		muted: tab.mutedInfo?.muted === true,
		active: tab.active === true,
	};
};

/**
 * Converts a Chrome window to domain window snapshot.
 * @param window - Chrome window.
 * @returns Domain window snapshot or null when ID is invalid.
 */
const toWindowSnapshot = (window: chrome.windows.Window): WindowSnapshot | null => {
	if (typeof window.id !== 'number') {
		return null;
	}

	const windowId = createWindowId(window.id);
	if (windowId === null) {
		return null;
	}

	return {
		id: windowId,
		incognito: window.incognito === true,
		focused: window.focused === true,
		type: toDomainWindowType(window.type),
		tabs: (window.tabs ?? []).map(toTabSnapshot).filter(isNotNull),
	};
};

/**
 * Creates a Chrome Windows API adapter.
 * @returns WindowPort implementation using chrome.windows API.
 */
export const createChromeWindowAdapter = (): WindowPort => ({
	getAllWindows: async (populate: boolean): Promise<readonly WindowSnapshot[]> => {
		const windows = await chrome.windows.getAll({ populate });
		return windows.map(toWindowSnapshot).filter(isNotNull);
	},
});
