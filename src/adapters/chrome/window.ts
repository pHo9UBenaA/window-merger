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
		index: tab.index,
		groupId,
		pinned: tab.pinned === true,
		muted: tab.mutedInfo?.muted === true,
		active: tab.active === true,
	};
};

// Tabs without a usable ID are dropped, so collect the survivors in one pass.
const toTabSnapshots = (tabs: chrome.tabs.Tab[] | undefined): TabSnapshot[] => {
	const snapshots: TabSnapshot[] = [];
	for (const tab of tabs ?? []) {
		const snapshot = toTabSnapshot(tab);
		if (snapshot !== null) snapshots.push(snapshot);
	}

	return snapshots;
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
		tabs: toTabSnapshots(window.tabs),
	};
};

// Windows without a usable ID are dropped, so collect the survivors in one pass.
const toWindowSnapshots = (windows: readonly chrome.windows.Window[]): WindowSnapshot[] => {
	const snapshots: WindowSnapshot[] = [];
	for (const window of windows) {
		const snapshot = toWindowSnapshot(window);
		if (snapshot !== null) snapshots.push(snapshot);
	}

	return snapshots;
};

export const createChromeWindowAdapter = (): WindowPort => ({
	getAllWindows: async (): Promise<readonly WindowSnapshot[]> => {
		return toWindowSnapshots(await chrome.windows.getAll({ populate: true }));
	},
});
