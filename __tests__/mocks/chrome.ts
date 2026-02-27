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
	},
};

/**
 * Helper to reset all Chrome API mocks.
 * Call this in beforeEach to ensure clean state between tests.
 */
export const resetChromeMocks = (): void => {
	VitestChrome.windows.getAll.mockReset();
	VitestChrome.tabs.move.mockReset();
	VitestChrome.tabs.update.mockReset();
	VitestChrome.tabGroups.move.mockReset();
};
