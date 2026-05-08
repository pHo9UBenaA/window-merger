// Domain types. Must stay platform-agnostic — no chrome.* imports, so the
// app and core layers can depend on this without pulling in Chrome APIs.

// Chrome uses 0 / -1 as sentinels for unspecified or missing IDs, so anything < 1 is invalid.
const MIN_VALID_ID = 1;

export type WindowId = {
	readonly kind: 'WindowId';
	readonly value: number;
};

export type TabId = {
	readonly kind: 'TabId';
	readonly value: number;
};

export type GroupId = {
	readonly kind: 'GroupId';
	readonly value: number;
};

export type WindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools' | 'unknown';

export const TARGET_WINDOW_TYPE = 'normal' as const;

export const createWindowId = (value: number): WindowId | null => {
	if (value < MIN_VALID_ID) {
		return null;
	}

	return { kind: 'WindowId', value };
};

export const createTabId = (value: number): TabId | null => {
	if (value < MIN_VALID_ID) {
		return null;
	}

	return { kind: 'TabId', value };
};

export const createGroupId = (value: number): GroupId | null => {
	if (value < MIN_VALID_ID) {
		return null;
	}

	return { kind: 'GroupId', value };
};

export type TabSnapshot = {
	readonly id: TabId;
	readonly groupId: GroupId | null;
	readonly pinned: boolean;
	readonly muted: boolean;
	readonly active: boolean;
};

export type WindowSnapshot = {
	readonly id: WindowId;
	readonly incognito: boolean;
	readonly focused: boolean;
	readonly type: WindowType;
	readonly tabs: readonly TabSnapshot[];
};

export type MoveToWindow = {
	readonly windowId: WindowId;
	readonly index: number;
};

export type TabUpdate = {
	readonly pinned?: boolean;
	readonly muted?: boolean;
	readonly active?: boolean;
};

export type MergeResult = {
	readonly targetWindowId: WindowId;
	readonly activeTabId: TabId;
};

export type MergeError =
	| {
			readonly type: 'insufficient-windows';
			readonly message: string;
			readonly context: {
				readonly windowCount: number;
			};
	  }
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
