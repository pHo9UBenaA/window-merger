/**
 * Chrome adapter for tab operations.
 * Implements TabPort using Chrome Tabs API.
 */

import type { MoveToWindow, TabId, TabUpdate } from '../../core/types/window-merge';
import type { TabPort } from '../../ports/tab';

/**
 * Creates a Chrome Tabs API adapter.
 * @returns TabPort implementation using chrome.tabs API.
 */
export const createChromeTabAdapter = (): TabPort => ({
	moveTabs: async (tabIds: readonly TabId[], moveProperties: MoveToWindow): Promise<void> => {
		if (tabIds.length === 0) {
			return;
		}

		await chrome.tabs.move(
			tabIds.map((tabId) => tabId.value),
			{
				windowId: moveProperties.windowId.value,
				index: moveProperties.index,
			}
		);
	},

	updateTab: async (tabId: TabId, properties: TabUpdate): Promise<void> => {
		await chrome.tabs.update(tabId.value, {
			pinned: properties.pinned,
			muted: properties.muted,
			active: properties.active,
		});
	},
});
