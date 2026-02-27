/**
 * Test helpers for creating Chrome API mock data.
 * Provides type-safe factories for windows and tabs.
 */

/**
 * Creates a mock Chrome tab for testing.
 * @param id - Tab ID.
 * @param options - Overridable tab fields.
 * @returns Chrome tab object.
 */
export const createMockChromeTab = (
	id: number,
	options: Partial<chrome.tabs.Tab> = {}
): chrome.tabs.Tab => {
	const tabBase: chrome.tabs.Tab = {
		active: options.active ?? false,
		audible: options.audible ?? false,
		autoDiscardable: options.autoDiscardable ?? true,
		discarded: options.discarded ?? false,
		frozen: options.frozen ?? false,
		groupId: options.groupId ?? -1,
		height: options.height ?? 0,
		highlighted: options.highlighted ?? false,
		id,
		incognito: options.incognito ?? false,
		index: options.index ?? 0,
		mutedInfo: options.mutedInfo ?? { muted: false },
		pinned: options.pinned ?? false,
		selected: options.selected ?? false,
		status: options.status,
		title: options.title ?? '',
		url: options.url ?? 'about:blank',
		width: options.width ?? 0,
		windowId: options.windowId ?? 1,
	};

	return { ...tabBase, ...options, id };
};

/**
 * Creates a mock Chrome window for testing.
 * @param id - Window ID.
 * @param tabs - Tab overrides.
 * @param options - Overridable window fields.
 * @returns Chrome window object.
 */
export const createMockChromeWindow = (
	id: number,
	tabs: Array<Partial<chrome.tabs.Tab> & { id: number }> = [],
	options: Partial<chrome.windows.Window> = {}
): chrome.windows.Window => {
	const windowBase: chrome.windows.Window = {
		alwaysOnTop: options.alwaysOnTop ?? false,
		focused: options.focused ?? false,
		height: options.height ?? 0,
		id,
		incognito: options.incognito ?? false,
		left: options.left ?? 0,
		state: options.state ?? 'normal',
		top: options.top ?? 0,
		type: options.type ?? 'normal',
		width: options.width ?? 0,
	};

	return {
		...windowBase,
		...options,
		id,
		tabs: tabs.map((tab) =>
			createMockChromeTab(tab.id, {
				windowId: id,
				incognito: options.incognito ?? false,
				...tab,
			})
		),
	};
};
