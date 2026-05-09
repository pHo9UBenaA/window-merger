import {
	createGroupId,
	createTabId,
	createWindowId,
	type TabSnapshot,
	type WindowSnapshot,
	type WindowType,
} from '../../domain/window-merge.types';
import type { WindowPort } from '../../ports/window';

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

const isNotNull = <T>(value: T | null): value is T => {
	return value !== null;
};

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

export const createChromeWindowAdapter = (): WindowPort => ({
	getAllWindows: async (populate: boolean): Promise<readonly WindowSnapshot[]> => {
		const windows = await chrome.windows.getAll({ populate });
		return windows.map(toWindowSnapshot).filter(isNotNull);
	},
});
