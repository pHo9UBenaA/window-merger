/**
 * Port (capability interface) for tab operations.
 * Defines what the application layer needs from tab management.
 */

import type { MoveToWindow, TabId, TabUpdate } from '../core/types/window-merge';

/**
 * Capability interface for tab operations.
 */
export type TabPort = {
	/**
	 * Updates tab properties.
	 * @param tabId - ID of the tab to update.
	 * @param properties - Properties to update (pinned, muted, active).
	 * @returns Promise that resolves when tab is updated.
	 */
	readonly updateTab: (tabId: TabId, properties: TabUpdate) => Promise<void>;

	/**
	 * Moves tabs to a new position.
	 * @param tabIds - Array of tab IDs to move.
	 * @param moveProperties - Destination window and index.
	 * @returns Promise that resolves when tabs are moved.
	 */
	readonly moveTabs: (tabIds: readonly TabId[], moveProperties: MoveToWindow) => Promise<void>;
};
