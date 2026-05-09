import type { MoveToWindow, TabId, TabUpdate } from '../../domain/window-merge.types';
import type { TabPort } from '../../ports/tab';

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
