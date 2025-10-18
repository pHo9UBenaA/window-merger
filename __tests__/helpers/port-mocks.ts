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
		getAllWindows: ReturnType<typeof vi.fn>;
		moveTabs: ReturnType<typeof vi.fn>;
		updateTab: ReturnType<typeof vi.fn>;
		queryTabs: ReturnType<typeof vi.fn>;
		moveGroup: ReturnType<typeof vi.fn>;
	};
} => {
	const getAllWindows = vi.fn();
	const moveTabs = vi.fn();
	const updateTab = vi.fn();
	const queryTabs = vi.fn();
	const moveGroup = vi.fn();

	// Type-check: Ensure mocks satisfy port interfaces
	const windowPort: WindowPort = { getAllWindows };
	const tabPort: TabPort = { moveTabs, updateTab, queryTabs };
	const tabGroupPort: TabGroupPort = { moveGroup };

	return {
		windowPort,
		tabPort,
		tabGroupPort,
		mocks: { getAllWindows, moveTabs, updateTab, queryTabs, moveGroup },
	};
};
