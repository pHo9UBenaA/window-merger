import { describe, expect, it } from 'vitest';
import { createChromeTabGroupAdapter } from '../../../../src/adapters/chrome/tab-group';
import { createTestGroupId, createTestWindowId } from '../../../factories/domain';
import { VitestChrome } from '../../../mocks/chrome';

describe('Chrome TabGroup Adapter', () => {
	it('unwraps group ID zero when reading, restoring and moving a group', async () => {
		VitestChrome.tabGroups.get.mockResolvedValue({
			id: 0,
			collapsed: true,
			color: 'blue',
			windowId: 1,
			shared: false,
		});
		const groupId = createTestGroupId(0);
		if (groupId === null) throw new Error('Missing fixture group ID');
		const adapter = createChromeTabGroupAdapter();
		expect(await adapter.getCollapsed(groupId)).toBe(true);
		expect(VitestChrome.tabGroups.get).toHaveBeenCalledExactlyOnceWith(0);
		await adapter.setCollapsed(groupId, false);
		expect(VitestChrome.tabGroups.update).toHaveBeenCalledExactlyOnceWith(0, {
			collapsed: false,
		});
		await adapter.moveGroup(groupId, { windowId: createTestWindowId(3), index: -1 });
		expect(VitestChrome.tabGroups.move).toHaveBeenCalledExactlyOnceWith(0, {
			windowId: 3,
			index: -1,
		});
	});
});
