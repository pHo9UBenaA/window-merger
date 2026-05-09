import type { GroupId, MoveToWindow } from '../domain/window-merge.types';

export type TabGroupPort = {
	readonly moveGroup: (groupId: GroupId, moveProperties: MoveToWindow) => Promise<void>;
};
