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
} from '../../src/domain/window-merge.types';

export const createTestWindowId = (value: number): WindowId => {
	const windowId = createWindowId(value);
	if (windowId === null) {
		throw new Error(`Invalid window id in test: ${value}`);
	}

	return windowId;
};

export const createTestTabId = (value: number): TabId => {
	const tabId = createTabId(value);
	if (tabId === null) {
		throw new Error(`Invalid tab id in test: ${value}`);
	}

	return tabId;
};

export const createTestGroupId = (value: number): GroupId | null => {
	return createGroupId(value);
};

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
