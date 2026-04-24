/**
 * Domain types for window merge use cases.
 * This module is pure and platform-agnostic.
 */

/**
 * Minimum valid identifier value.
 */
const MIN_VALID_ID = 1;

/**
 * Domain identifier for browser windows.
 */
export type WindowId = {
	readonly kind: 'WindowId';
	readonly value: number;
};

/**
 * Domain identifier for browser tabs.
 */
export type TabId = {
	readonly kind: 'TabId';
	readonly value: number;
};

/**
 * Domain identifier for browser tab groups.
 */
export type GroupId = {
	readonly kind: 'GroupId';
	readonly value: number;
};

/**
 * Domain-level window type.
 */
export type WindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools' | 'unknown';

/**
 * Target window type for merge operations.
 */
export const TARGET_WINDOW_TYPE = 'normal' as const;

/**
 * Creates a window ID value object.
 * @param value - Raw window ID.
 * @returns Window ID or null if invalid.
 */
export const createWindowId = (value: number): WindowId | null => {
	if (value < MIN_VALID_ID) {
		return null;
	}

	return { kind: 'WindowId', value };
};

/**
 * Creates a tab ID value object.
 * @param value - Raw tab ID.
 * @returns Tab ID or null if invalid.
 */
export const createTabId = (value: number): TabId | null => {
	if (value < MIN_VALID_ID) {
		return null;
	}

	return { kind: 'TabId', value };
};

/**
 * Creates a group ID value object.
 * @param value - Raw group ID.
 * @returns Group ID or null if invalid.
 */
export const createGroupId = (value: number): GroupId | null => {
	if (value < MIN_VALID_ID) {
		return null;
	}

	return { kind: 'GroupId', value };
};

/**
 * Immutable tab snapshot used by core/app layers.
 */
export type TabSnapshot = {
	readonly id: TabId;
	readonly groupId: GroupId | null;
	readonly pinned: boolean;
	readonly muted: boolean;
	readonly active: boolean;
};

/**
 * Immutable window snapshot used by core/app layers.
 */
export type WindowSnapshot = {
	readonly id: WindowId;
	readonly incognito: boolean;
	readonly focused: boolean;
	readonly type: WindowType;
	readonly tabs: readonly TabSnapshot[];
};

/**
 * Move properties for tab and group movement.
 */
export type MoveToWindow = {
	readonly windowId: WindowId;
	readonly index: number;
};

/**
 * Updatable tab properties.
 */
export type TabUpdate = {
	readonly pinned?: boolean;
	readonly muted?: boolean;
	readonly active?: boolean;
};

/**
 * Result of a window merge operation.
 */
export type MergeResult = {
	readonly targetWindowId: WindowId;
	readonly activeTabId: TabId;
};

/**
 * Error cases that can occur during window merge operations.
 */
export type MergeError =
	| {
			readonly type: 'no-valid-target';
			readonly message: string;
			readonly context: {
				readonly windowCount: number;
			};
	  }
	| {
			readonly type: 'no-active-tab';
			readonly message: string;
			readonly context: {
				readonly windowCount: number;
			};
	  };
