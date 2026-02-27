/**
 * Chrome adapter for tab group operations.
 * Implements TabGroupPort using Chrome Tab Groups API.
 */

import type { GroupId, MoveToWindow } from '../../core/types/window-merge';
import type { TabGroupPort } from '../../ports/tab-group';

/**
 * Creates a Chrome Tab Groups API adapter.
 * @returns TabGroupPort implementation using chrome.tabGroups API.
 */
export const createChromeTabGroupAdapter = (): TabGroupPort => ({
	moveGroup: async (groupId: GroupId, moveProperties: MoveToWindow): Promise<void> => {
		await chrome.tabGroups.move(groupId.value, {
			windowId: moveProperties.windowId.value,
			index: moveProperties.index,
		});
	},
});
