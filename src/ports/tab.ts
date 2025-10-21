/**
 * Port (capability interface) for tab operations.
 * Defines what the application layer needs from tab management,
 * independent of Chrome API implementation.
 */

/**
 * Capability interface for tab operations.
 * Uses Chrome API types directly.
 */
export type TabPort = {
	/**
	 * Updates tab properties.
	 * @param tabId - ID of the tab to update.
	 * @param properties - Properties to update (pinned, muted, active).
	 * @returns Promise that resolves when tab is updated.
	 */
	readonly updateTab: (
		tabId: NonNullable<chrome.tabs.Tab['id']>,
		properties: {
			readonly pinned?: chrome.tabs.Tab['pinned'];
			readonly muted?: NonNullable<chrome.tabs.Tab['mutedInfo']>['muted'];
			readonly active?: chrome.tabs.Tab['active'];
		}
	) => Promise<void>;

	/**
	 * Moves tabs to a new position.
	 * @param tabIds - Array of tab IDs to move.
	 * @param moveProperties - Destination window and index.
	 * @returns Promise that resolves when tabs are moved.
	 */
	readonly moveTabs: (
		tabIds: readonly NonNullable<chrome.tabs.Tab['id']>[],
		moveProperties: chrome.tabs.MoveProperties
	) => Promise<void>;

	/**
	 * Queries tabs in a specific window.
	 * @param windowId - ID of the window to query.
	 * @returns Promise of Chrome tabs.
	 */
	readonly queryTabs: (
		windowId: NonNullable<chrome.windows.Window['id']>
	) => Promise<readonly chrome.tabs.Tab[]>;
};
