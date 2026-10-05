import type { GroupId, MoveToWindow } from '../domain/window-merge.types';

export type TabGroupPort = {
	readonly getCollapsed: (groupId: GroupId) => Promise<boolean>;
	readonly setCollapsed: (groupId: GroupId, collapsed: boolean) => Promise<void>;
	readonly moveGroup: (groupId: GroupId, moveProperties: MoveToWindow) => Promise<void>;
};
