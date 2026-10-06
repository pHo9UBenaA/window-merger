import { vi } from 'vitest';
import type { MergeWindowsDeps } from '../../src/application/merge-windows';
import type { TabPort } from '../../src/ports/tab';
import type { TabGroupPort } from '../../src/ports/tab-group';
import type { WindowPort } from '../../src/ports/window';

export const createMockMergeWindowsDeps = (): MergeWindowsDeps & {
	mocks: {
		getAllWindows: ReturnType<typeof vi.fn<WindowPort['getAllWindows']>>;
		moveTabs: ReturnType<typeof vi.fn<TabPort['moveTabs']>>;
		updateTab: ReturnType<typeof vi.fn<TabPort['updateTab']>>;
		moveGroup: ReturnType<typeof vi.fn<TabGroupPort['moveGroup']>>;
		getCollapsed: ReturnType<typeof vi.fn<TabGroupPort['getCollapsed']>>;
		setCollapsed: ReturnType<typeof vi.fn<TabGroupPort['setCollapsed']>>;
	};
} => {
	const getAllWindows = vi.fn<WindowPort['getAllWindows']>();
	const moveTabs = vi.fn<TabPort['moveTabs']>();
	const updateTab = vi.fn<TabPort['updateTab']>();
	const moveGroup = vi.fn<TabGroupPort['moveGroup']>();

	const windowPort: WindowPort = { getAllWindows };
	const tabPort: TabPort = { moveTabs, updateTab };
	const getCollapsed = vi.fn<TabGroupPort['getCollapsed']>().mockResolvedValue(false);
	const setCollapsed = vi.fn<TabGroupPort['setCollapsed']>();
	const tabGroupPort: TabGroupPort = { moveGroup, getCollapsed, setCollapsed };

	return {
		windowPort,
		tabPort,
		tabGroupPort,
		mocks: { getAllWindows, moveTabs, updateTab, moveGroup, getCollapsed, setCollapsed },
	};
};
