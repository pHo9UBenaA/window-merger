import { describe, expect, it } from 'vitest';
import { createChromeWindowAdapter } from '../../../../src/adapters/chrome/window';
import { createMockChromeTab, createMockChromeWindow } from '../../../factories/chrome';
import { createTestGroupId, createTestTabId, createTestWindowId } from '../../../factories/domain';
import { VitestChrome } from '../../../mocks/chrome';

describe('Chrome Window Adapter', () => {
	it('requests populated windows and maps metadata, including zero IDs and ungrouped tabs', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([
			createMockChromeWindow(
				0,
				[
					{ id: 0, active: true, pinned: true, groupId: 0, mutedInfo: { muted: true } },
					{
						id: 11,
						active: false,
						pinned: false,
						groupId: -1,
						mutedInfo: { muted: false },
					},
				],
				{ focused: true, incognito: true, type: 'normal' }
			),
		]);
		expect(await createChromeWindowAdapter().getAllWindows()).toEqual([
			{
				id: createTestWindowId(0),
				focused: true,
				incognito: true,
				type: 'normal',
				tabs: [
					{
						id: createTestTabId(0),
						index: 0,
						active: true,
						pinned: true,
						muted: true,
						groupId: createTestGroupId(0),
					},
					{
						id: createTestTabId(11),
						index: 1,
						active: false,
						pinned: false,
						muted: false,
						groupId: null,
					},
				],
			},
		]);
		expect(VitestChrome.windows.getAll).toHaveBeenCalledExactlyOnceWith({ populate: true });
	});

	it('drops windows and tabs whose IDs are absent or negative', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([
			{ ...createMockChromeWindow(1), id: undefined },
			{ ...createMockChromeWindow(2), id: -1 },
			{
				...createMockChromeWindow(3),
				tabs: [
					{ ...createMockChromeTab(1), id: undefined },
					{ ...createMockChromeTab(2), id: -1 },
					createMockChromeTab(3),
				],
			},
		]);
		const windows = await createChromeWindowAdapter().getAllWindows();
		expect(windows.map((window) => window.id.value)).toEqual([3]);
		expect(windows[0].tabs.map((tab) => tab.id.value)).toEqual([3]);
	});

	it('handles omitted window type, tabs and group metadata', async () => {
		// Chrome can omit groupId even though @types/chrome marks it as required.
		const tab = createMockChromeTab(1);
		Reflect.deleteProperty(tab, 'groupId');
		VitestChrome.windows.getAll.mockResolvedValue([
			{ ...createMockChromeWindow(1), type: undefined, tabs: undefined },
			{ ...createMockChromeWindow(2), tabs: [tab] },
		]);
		const windows = await createChromeWindowAdapter().getAllWindows();
		expect(windows[0]).toMatchObject({ type: 'unknown', tabs: [] });
		expect(windows[1].tabs[0].groupId).toBeNull();
	});
});
