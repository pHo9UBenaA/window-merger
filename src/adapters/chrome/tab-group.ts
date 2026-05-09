import type { GroupId, MoveToWindow } from '../../domain/window-merge.types';
import type { TabGroupPort } from '../../ports/tab-group';

export const createChromeTabGroupAdapter = (): TabGroupPort => ({
	moveGroup: async (groupId: GroupId, moveProperties: MoveToWindow): Promise<void> => {
		await chrome.tabGroups.move(groupId.value, {
			windowId: moveProperties.windowId.value,
			index: moveProperties.index,
		});
	},
});
