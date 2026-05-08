import type { WindowSnapshot } from '../core/window-merge.types';

export type WindowPort = {
	readonly getAllWindows: (populate: boolean) => Promise<readonly WindowSnapshot[]>;
};
