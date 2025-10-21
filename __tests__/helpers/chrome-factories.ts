/**
 * Test helpers for creating Chrome API mock data.
 * Provides type-safe factories for windows, tabs, etc.
 */

/**
 * Helper to create mock Chrome windows for testing.
 * Provides type-safe window creation with sensible defaults.
 */
export const createMockChromeWindow = (
	id: number,
	tabs: Array<Partial<chrome.tabs.Tab> & { id: number }> = [],
	options: Partial<chrome.windows.Window> = {}
): chrome.windows.Window => {
	return {
		id,
		type: 'normal',
		incognito: false,
		focused: false,
		state: 'normal',
		alwaysOnTop: false,
		...options,
		tabs: tabs.map((tab) => ({
			index: 0,
			windowId: id,
			highlighted: false,
			active: false,
			pinned: false,
			url: 'about:blank',
			title: '',
			favIconUrl: undefined,
			groupId: -1,
			mutedInfo: { muted: false },
			incognito: options.incognito ?? false,
			...tab,
			id: tab.id,
		})) as chrome.tabs.Tab[],
	} as chrome.windows.Window;
};

/**
 * Helper to create mock Chrome tabs for testing.
 * Provides type-safe tab creation with sensible defaults.
 */
export const createMockChromeTab = (
	id: number,
	options: Partial<chrome.tabs.Tab> = {}
): chrome.tabs.Tab => {
	return {
		id,
		index: 0,
		windowId: 1,
		highlighted: false,
		active: false,
		pinned: false,
		url: 'about:blank',
		title: '',
		groupId: -1,
		mutedInfo: { muted: false },
		incognito: false,
		...options,
	} as chrome.tabs.Tab;
};
