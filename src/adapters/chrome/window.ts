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

	const tabs: TabSnapshot[] = [];
	for (const tab of window.tabs ?? []) {
		const snapshot = toTabSnapshot(tab);
		if (snapshot !== null) tabs.push(snapshot);
	}

	return {
		id: windowId,
		incognito: window.incognito === true,
		focused: window.focused === true,
		type: toDomainWindowType(window.type),
		tabs,
	};
};

export const createChromeWindowAdapter = (): WindowPort => ({
	getAllWindows: async (): Promise<readonly WindowSnapshot[]> => {
		const windows = await chrome.windows.getAll({ populate: true });
		const snapshots: WindowSnapshot[] = [];
		for (const window of windows) {
			const snapshot = toWindowSnapshot(window);
			if (snapshot !== null) snapshots.push(snapshot);
		}
		return snapshots;
	},
});
