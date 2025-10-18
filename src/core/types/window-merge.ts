/**
 * Domain types for window merging functionality.
 * These types model the core domain concepts using Chrome API types directly.
 */

/**
 * Target window type for merging operations.
 */
export const TARGET_WINDOW_TYPE = 'normal' as const;

/**
 * Result of a window merge operation.
 * Uses Chrome API types directly.
 */
export type MergeResult = {
	/** ID of the target window where tabs were merged */
	readonly targetWindowId: NonNullable<chrome.windows.Window['id']>;
	/** ID of the tab that should be activated after merge */
	readonly activeTabId: chrome.tabs.Tab['id'];
};

/**
 * Error cases that can occur during window merge operations.
 */
export type MergeError =
	| {
			readonly type: 'no-valid-target';
			readonly message: string;
	  }
	| {
			readonly type: 'no-active-tab';
			readonly message: string;
	  };
