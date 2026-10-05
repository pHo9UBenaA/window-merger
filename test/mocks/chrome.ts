import { type MockedFunction, vi } from 'vitest';

type WindowsGetAll = (
	queryInfo: chrome.windows.QueryOptions
) => Promise<readonly chrome.windows.Window[]>;

type TabsMove = (
	tabIds: number | number[],
	moveProperties: chrome.tabs.MoveProperties
) => Promise<chrome.tabs.Tab | chrome.tabs.Tab[] | undefined>;

type TabsUpdate = (
	tabId: number,
	updateProperties: chrome.tabs.UpdateProperties
) => Promise<chrome.tabs.Tab | undefined>;

type TabGroupsMove = (
	groupId: number,
	moveProperties: chrome.tabGroups.MoveProperties
) => Promise<chrome.tabGroups.TabGroup | undefined>;

type VitestChrome = {
	windows: {
		getAll: MockedFunction<WindowsGetAll>;
	};
	tabs: {
		move: MockedFunction<TabsMove>;
		update: MockedFunction<TabsUpdate>;
	};
	tabGroups: {
		move: MockedFunction<TabGroupsMove>;
		get: MockedFunction<(groupId: number) => Promise<chrome.tabGroups.TabGroup>>;
		update: MockedFunction<
			(
				groupId: number,
				properties: chrome.tabGroups.UpdateProperties
			) => Promise<chrome.tabGroups.TabGroup | undefined>
		>;
	};
};

export const VitestChrome: VitestChrome = {
	windows: {
		getAll: vi.fn<WindowsGetAll>(),
	},
	tabs: {
		move: vi.fn<TabsMove>(),
		update: vi.fn<TabsUpdate>(),
	},
	tabGroups: {
		move: vi.fn<TabGroupsMove>(),
		get: vi.fn(),
		update: vi.fn(),
	},
};
