import { type MockedFunction, vi } from 'vitest';

type VitestChrome = {
	windows: {
		getAll: MockedFunction<(typeof chrome.windows)['getAll']>;
	};
	tabs: {
		query: MockedFunction<(typeof chrome.tabs)['query']>;
		move: MockedFunction<(typeof chrome.tabs)['move']>;
		update: MockedFunction<(typeof chrome.tabs)['update']>;
	};
	tabGroups: {
		move: MockedFunction<(typeof chrome.tabGroups)['move']>;
	};
};

export const VitestChrome: VitestChrome = {
	windows: {
		getAll: vi.fn(),
	},
	tabs: {
		query: vi.fn(),
		move: vi.fn(),
		update: vi.fn(),
	},
	tabGroups: {
		move: vi.fn(),
	},
};
