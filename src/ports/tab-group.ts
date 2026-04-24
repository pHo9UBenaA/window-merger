import type { GroupId, MoveToWindow } from '../core/window-merge.types';

export type TabGroupPort = {
	readonly moveGroup: (groupId: GroupId, moveProperties: MoveToWindow) => Promise<void>;
};
