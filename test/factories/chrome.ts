export const createMockChromeTab = (
	id: number,
	options: Partial<chrome.tabs.Tab> = {}
): chrome.tabs.Tab => ({
	active: false,
	audible: false,
	autoDiscardable: true,
	discarded: false,
	frozen: false,
	groupId: -1,
	highlighted: false,
	incognito: false,
	index: 0,
	lastAccessed: 0,
	mutedInfo: { muted: false },
	pinned: false,
	selected: false,
	windowId: 1,
	...options,
	id,
});

export const createMockChromeWindow = (
	id: number,
	tabs: Array<Partial<chrome.tabs.Tab> & { id: number }> = [],
	options: Partial<chrome.windows.Window> = {}
): chrome.windows.Window => ({
	alwaysOnTop: false,
	focused: false,
	incognito: false,
	state: 'normal',
	type: 'normal',
	...options,
	id,
	tabs: tabs.map((tab, index) =>
		createMockChromeTab(tab.id, {
			index,
			windowId: id,
			incognito: options.incognito ?? false,
			...tab,
		})
	),
});
