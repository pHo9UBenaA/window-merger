/**
 * Port (capability interface) for tab group operations.
 * Defines what the application layer needs from tab group management.
 */

import type { GroupId, MoveToWindow } from '../core/types/window-merge';

/**
 * Capability interface for tab group operations.
 */
export type TabGroupPort = {
	/**
	 * Moves a tab group to a new window.
	 * @param groupId - ID of the group to move.
	 * @param moveProperties - Destination window and index.
	 * @returns Promise that resolves when group is moved.
	 */
	readonly moveGroup: (groupId: GroupId, moveProperties: MoveToWindow) => Promise<void>;
};
