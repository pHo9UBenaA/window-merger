import type { WindowSnapshot } from '../domain/window-merge.types';

export type WindowPort = {
	readonly getAllWindows: (populate: boolean) => Promise<readonly WindowSnapshot[]>;
};
