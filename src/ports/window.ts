/**
 * Port (capability interface) for window operations.
 * Defines what the application layer needs from window management,
 * independent of Chrome API implementation.
 */

/**
 * Capability interface for window operations.
 */
export type WindowPort = {
	/**
	 * Retrieves all windows with their tabs.
	 * @param populate - Whether to include tab information.
	 * @returns Promise of all windows.
	 */
	readonly getAllWindows: (populate: boolean) => Promise<readonly chrome.windows.Window[]>;
};
