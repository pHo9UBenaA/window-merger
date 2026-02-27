/**
 * Test helpers for domain snapshot factories.
 */

import {
	createGroupId,
	createTabId,
	createWindowId,
	type GroupId,
	TARGET_WINDOW_TYPE,
	type TabId,
	type TabSnapshot,
	type WindowId,
	type WindowSnapshot,
	type WindowType,
} from '../../src/core/types/window-merge';

/**
 * Creates a valid window ID for tests.
 * @param value - Raw window ID.
 * @returns Window ID.
 */
export const createTestWindowId = (value: number): WindowId => {
	const windowId = createWindowId(value);
	if (windowId === null) {
		throw new Error(`Invalid window id in test: ${value}`);
	}

	return windowId;
};

/**
 * Creates a valid tab ID for tests.
 * @param value - Raw tab ID.
 * @returns Tab ID.
 */
export const createTestTabId = (value: number): TabId => {
	const tabId = createTabId(value);
	if (tabId === null) {
		throw new Error(`Invalid tab id in test: ${value}`);
	}

	return tabId;
};

/**
 * Creates an optional group ID for tests.
 * @param value - Raw group ID.
 * @returns Group ID or null.
 */
export const createTestGroupId = (value: number): GroupId | null => {
	return createGroupId(value);
};

/**
 * Creates a tab snapshot for tests.
 * @param id - Raw tab ID.
 * @param options - Overridable tab fields.
 * @returns Tab snapshot.
 */
export const createMockTabSnapshot = (
	id: number,
	options: Partial<Omit<TabSnapshot, 'id'>> = {}
): TabSnapshot => {
	return {
		id: createTestTabId(id),
		groupId: null,
		pinned: false,
		muted: false,
		active: false,
		...options,
	};
};

/**
 * Creates a window snapshot for tests.
 * @param id - Raw window ID.
 * @param tabs - Tab snapshots.
 * @param options - Overridable window fields.
 * @returns Window snapshot.
 */
export const createMockWindowSnapshot = (
	id: number,
	tabs: readonly TabSnapshot[] = [],
	options: {
		readonly incognito?: boolean;
		readonly focused?: boolean;
		readonly type?: WindowType;
	} = {}
): WindowSnapshot => {
	return {
		id: createTestWindowId(id),
		incognito: options.incognito ?? false,
		focused: options.focused ?? false,
		type: options.type ?? TARGET_WINDOW_TYPE,
		tabs,
	};
};
