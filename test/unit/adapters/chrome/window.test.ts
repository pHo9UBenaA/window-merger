import { describe, expect, it } from 'vitest';
import { createChromeWindowAdapter } from '../../../../src/adapters/chrome/window';
import { createMockChromeTab, createMockChromeWindow } from '../../../factories/chrome';
import { createTestGroupId, createTestTabId, createTestWindowId } from '../../../factories/domain';
import { VitestChrome } from '../../../mocks/chrome';

describe('Chrome Window Adapter', () => {
	it('preserves zero window, tab and group IDs', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([
			createMockChromeWindow(0, [{ id: 0, groupId: 0 }]),
		]);
		const [window] = await createChromeWindowAdapter().getAllWindows();
		expect(window.id.value).toBe(0);
		expect(window.tabs[0].id.value).toBe(0);
		expect(window.tabs[0].groupId?.value).toBe(0);
	});

	it('handles empty window list', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows();

		expect(result).toEqual([]);
	});

	it('always calls chrome.windows.getAll with populate=true', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([]);

		const adapter = createChromeWindowAdapter();
		await adapter.getAllWindows();

		expect(VitestChrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
	});

	it('maps Chrome window and tab properties to snapshots', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([
			createMockChromeWindow(
				1,
				[
					{ id: 10, active: true, pinned: true, groupId: 5, mutedInfo: { muted: true } },
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

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows();

		expect(result).toEqual([
			{
				id: createTestWindowId(1),
				focused: true,
				incognito: true,
				type: 'normal',
				tabs: [
					{
						id: createTestTabId(10),
						index: 0,
						active: true,
						pinned: true,
						muted: true,
						groupId: createTestGroupId(5),
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
	});

	it('maps unknown window type to unknown', async () => {
		const unsupportedTypeWindow: chrome.windows.Window = {
			...createMockChromeWindow(1, [{ id: 1 }]),
			type: undefined,
		};
		VitestChrome.windows.getAll.mockResolvedValue([unsupportedTypeWindow]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows();

		expect(result[0]?.type).toBe('unknown');
	});

	it('filters out windows that do not have valid IDs', async () => {
		const invalidWindow: chrome.windows.Window = {
			...createMockChromeWindow(2, [{ id: 2 }]),
			id: -1,
		};
		VitestChrome.windows.getAll.mockResolvedValue([
			createMockChromeWindow(1, [{ id: 1 }]),
			invalidWindow,
		]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows();

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toEqual(createTestWindowId(1));
	});

	it('filters out tabs with invalid IDs', async () => {
		const invalidTab: chrome.tabs.Tab = {
			...createMockChromeTab(12),
			id: -1,
		};
		VitestChrome.windows.getAll.mockResolvedValue([
			{
				...createMockChromeWindow(1),
				tabs: [createMockChromeTab(11), invalidTab],
			},
		]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows();

		expect(result[0]?.tabs).toHaveLength(1);
		expect(result[0]?.tabs[0]?.id).toEqual(createTestTabId(11));
	});

	it('propagates errors from chrome.windows.getAll', async () => {
		VitestChrome.windows.getAll.mockRejectedValue(new Error('Chrome API error'));

		const adapter = createChromeWindowAdapter();

		await expect(adapter.getAllWindows()).rejects.toThrow('Chrome API error');
	});

	it('filters out tabs where id property is absent', async () => {
		const tabWithoutId: chrome.tabs.Tab = { ...createMockChromeTab(1), id: undefined };
		VitestChrome.windows.getAll.mockResolvedValue([
			{ ...createMockChromeWindow(1), tabs: [tabWithoutId] },
		]);

		const result = await createChromeWindowAdapter().getAllWindows();

		expect(result[0]?.tabs).toHaveLength(0);
	});

	it('maps tab with undefined groupId to null groupId', async () => {
		// Chrome omits `groupId` where tab groups are unavailable; @types/chrome types it as required.
		const tabWithoutGroupId = createMockChromeTab(1);
		Reflect.deleteProperty(tabWithoutGroupId, 'groupId');
		VitestChrome.windows.getAll.mockResolvedValue([
			{ ...createMockChromeWindow(1), tabs: [tabWithoutGroupId] },
		]);

		const result = await createChromeWindowAdapter().getAllWindows();

		expect(result[0]?.tabs[0]?.groupId).toBeNull();
	});

	it('filters out windows where id property is absent', async () => {
		const windowWithoutId: chrome.windows.Window = {
			...createMockChromeWindow(2, [{ id: 2 }]),
			id: undefined,
		};
		VitestChrome.windows.getAll.mockResolvedValue([
			createMockChromeWindow(1, [{ id: 1 }]),
			windowWithoutId,
		]);

		const result = await createChromeWindowAdapter().getAllWindows();

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toEqual(createTestWindowId(1));
	});

	it('returns empty tabs array when window has no tabs property', async () => {
		const windowWithoutTabs: chrome.windows.Window = {
			...createMockChromeWindow(1),
			tabs: undefined,
		};
		VitestChrome.windows.getAll.mockResolvedValue([windowWithoutTabs]);

		const result = await createChromeWindowAdapter().getAllWindows();

		expect(result[0]?.tabs).toEqual([]);
	});
});
