/**
 * Chrome adapter for tab operations.
 * Implements TabPort using Chrome Tabs API.
 * Contains all Chrome-specific implementation details.
 */

import type { TabPort } from '../../ports/tab';

/**
 * Creates a Chrome Tabs API adapter.
 * @returns TabPort implementation using chrome.tabs API.
 */
export const createChromeTabAdapter = (): TabPort => ({
	moveTabs: async (
		tabIds: readonly NonNullable<chrome.tabs.Tab['id']>[],
		moveProperties: chrome.tabs.MoveProperties
	): Promise<void> => {
		await chrome.tabs.move([...tabIds], {
			windowId: moveProperties.windowId,
			index: moveProperties.index,
		});
	},

	updateTab: async (
		tabId: NonNullable<chrome.tabs.Tab['id']>,
		properties: {
			readonly pinned?: chrome.tabs.Tab['pinned'];
			readonly muted?: NonNullable<chrome.tabs.Tab['mutedInfo']>['muted'];
			readonly active?: chrome.tabs.Tab['active'];
		}
	): Promise<void> => {
		await chrome.tabs.update(tabId, {
			pinned: properties.pinned,
			muted: properties.muted,
			active: properties.active,
		});
	},

	queryTabs: async (
		windowId: NonNullable<chrome.windows.Window['id']>
	): Promise<readonly chrome.tabs.Tab[]> => {
		return await chrome.tabs.query({ windowId });
	},
});
