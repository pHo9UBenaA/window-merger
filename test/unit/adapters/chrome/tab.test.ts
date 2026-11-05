import { describe, expect, it } from 'vitest';
import { createChromeTabAdapter } from '../../../../src/adapters/chrome/tab';
import { createTestTabId, createTestWindowId } from '../../../factories/domain';
import { VitestChrome } from '../../../mocks/chrome';

describe('Chrome Tab Adapter', () => {
	it('unwraps tab and window IDs and appends the tabs in the requested order', async () => {
		await createChromeTabAdapter().moveTabs([createTestTabId(2), createTestTabId(0)], {
			windowId: createTestWindowId(1),
			index: -1,
		});
		expect(VitestChrome.tabs.move).toHaveBeenCalledExactlyOnceWith([2, 0], {
			windowId: 1,
			index: -1,
		});
	});

	it('forwards explicit true and false updates without resetting omitted properties', async () => {
		const adapter = createChromeTabAdapter();
		await adapter.updateTab(createTestTabId(42), { pinned: true });
		await adapter.updateTab(createTestTabId(42), { pinned: false, muted: true, active: false });
		expect(VitestChrome.tabs.update.mock.calls).toEqual([
			[42, { pinned: true, muted: undefined, active: undefined }],
			[42, { pinned: false, muted: true, active: false }],
		]);
	});
});
