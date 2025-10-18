/**
 * Chrome adapter for tab group operations.
 * Implements TabGroupPort using Chrome Tab Groups API.
 * Contains all Chrome-specific implementation details.
 */

import type { TabGroupPort } from '../../ports/tab-group';

/**
 * Creates a Chrome Tab Groups API adapter.
 * @returns TabGroupPort implementation using chrome.tabGroups API.
 */
export const createChromeTabGroupAdapter = (): TabGroupPort => ({
	moveGroup: async (
		groupId: NonNullable<chrome.tabs.Tab['groupId']>,
		moveProperties: chrome.tabGroups.MoveProperties
	): Promise<void> => {
		await chrome.tabGroups.move(groupId, {
			windowId: moveProperties.windowId,
			index: moveProperties.index,
		});
	},
});
