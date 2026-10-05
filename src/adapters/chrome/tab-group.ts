import type { GroupId, MoveToWindow } from '../../domain/window-merge.types';
import type { TabGroupPort } from '../../ports/tab-group';

export const createChromeTabGroupAdapter = (): TabGroupPort => ({
	getCollapsed: async (groupId) => (await chrome.tabGroups.get(groupId.value)).collapsed,
	setCollapsed: async (groupId, collapsed) => {
		await chrome.tabGroups.update(groupId.value, { collapsed });
	},
	moveGroup: async (groupId: GroupId, moveProperties: MoveToWindow): Promise<void> => {
		await chrome.tabGroups.move(groupId.value, {
			windowId: moveProperties.windowId.value,
			index: moveProperties.index,
		});
	},
});
