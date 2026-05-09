import type { WindowSnapshot } from '../domain/window-merge.types';

export type WindowPort = {
	readonly getAllWindows: () => Promise<readonly WindowSnapshot[]>;
};
