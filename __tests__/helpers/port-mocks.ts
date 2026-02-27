/**
 * Test helpers for creating type-safe mocks for port dependencies.
 */

import { vi } from 'vitest';
import type { MergeWindowsDeps } from '../../src/app/merge-windows';
import type { TabPort } from '../../src/ports/tab';
import type { TabGroupPort } from '../../src/ports/tab-group';
import type { WindowPort } from '../../src/ports/window';

/**
 * Creates type-safe mock dependencies for testing merge windows use case.
 * Ensures mocks satisfy the MergeWindowsDeps interface at compile time.
 *
 * @returns Mock dependencies with exposed mock functions for testing
 */
export const createMockMergeWindowsDeps = (): MergeWindowsDeps & {
	mocks: {
		getAllWindows: ReturnType<typeof vi.fn<WindowPort['getAllWindows']>>;
		moveTabs: ReturnType<typeof vi.fn<TabPort['moveTabs']>>;
		updateTab: ReturnType<typeof vi.fn<TabPort['updateTab']>>;
		moveGroup: ReturnType<typeof vi.fn<TabGroupPort['moveGroup']>>;
	};
} => {
	const getAllWindows = vi.fn<WindowPort['getAllWindows']>();
	const moveTabs = vi.fn<TabPort['moveTabs']>();
	const updateTab = vi.fn<TabPort['updateTab']>();
	const moveGroup = vi.fn<TabGroupPort['moveGroup']>();

	const windowPort: WindowPort = { getAllWindows };
	const tabPort: TabPort = { moveTabs, updateTab };
	const tabGroupPort: TabGroupPort = { moveGroup };

	return {
		windowPort,
		tabPort,
		tabGroupPort,
		mocks: { getAllWindows, moveTabs, updateTab, moveGroup },
	};
};
