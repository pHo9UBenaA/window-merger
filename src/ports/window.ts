/**
 * Port (capability interface) for window operations.
 * Defines what the application layer needs from window management.
 */

import type { WindowSnapshot } from '../core/types/window-merge';

/**
 * Capability interface for window operations.
 */
export type WindowPort = {
	/**
	 * Retrieves all windows with their tabs.
	 * @param populate - Whether to include tab information.
	 * @returns Promise of domain window snapshots.
	 */
	readonly getAllWindows: (populate: boolean) => Promise<readonly WindowSnapshot[]>;
};
