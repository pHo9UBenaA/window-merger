/**
 * Port (capability interface) for tab group operations.
 * Defines what the application layer needs from tab group management,
 * independent of Chrome API implementation.
 */

/**
 * Capability interface for tab group operations.
 * Uses Chrome API types directly.
 */
export type TabGroupPort = {
	/**
	 * Moves a tab group to a new window.
	 * @param groupId - ID of the group to move.
	 * @param moveProperties - Destination window and index.
	 * @returns Promise that resolves when group is moved.
	 */
	readonly moveGroup: (
		groupId: NonNullable<chrome.tabs.Tab['groupId']>,
		moveProperties: chrome.tabGroups.MoveProperties
	) => Promise<void>;
};
