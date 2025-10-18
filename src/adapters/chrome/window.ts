/**
 * Chrome adapter for window operations.
 * Implements WindowPort using Chrome Windows API.
 * Contains all Chrome-specific implementation details.
 */

import type { WindowPort } from '../../ports/window';

/**
 * Creates a Chrome Windows API adapter.
 * @returns WindowPort implementation using chrome.windows API.
 */
export const createChromeWindowAdapter = (): WindowPort => ({
	getAllWindows: async (populate: boolean): Promise<readonly chrome.windows.Window[]> => {
		return await chrome.windows.getAll({ populate });
	},
});
