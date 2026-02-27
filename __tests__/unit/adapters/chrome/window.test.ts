/**
 * Tests for Chrome Window Adapter.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeWindowAdapter } from '../../../../src/adapters/chrome/window';
import { createMockChromeTab, createMockChromeWindow } from '../../../helpers/chrome-factories';
import {
	createTestGroupId,
	createTestTabId,
	createTestWindowId,
} from '../../../helpers/domain-factories';
import { resetChromeMocks, VitestChrome } from '../../../mocks/chrome';

describe('Chrome Window Adapter', () => {
	beforeEach(() => {
		resetChromeMocks();
	});

	it('returns windows when populate=true', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([createMockChromeWindow(1, [{ id: 1 }])]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(1);
	});

	it('returns windows when populate=false', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([createMockChromeWindow(1)]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(false);

		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(1);
	});

	it('handles empty window list', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(result).toEqual([]);
	});

	it('calls chrome.windows.getAll with populate=true', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([]);

		const adapter = createChromeWindowAdapter();
		await adapter.getAllWindows(true);

		expect(VitestChrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
	});

	it('calls chrome.windows.getAll with populate=false', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([]);

		const adapter = createChromeWindowAdapter();
		await adapter.getAllWindows(false);

		expect(VitestChrome.windows.getAll).toHaveBeenCalledWith({ populate: false });
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
		const result = await adapter.getAllWindows(true);

		expect(result).toEqual([
			{
				id: createTestWindowId(1),
				focused: true,
				incognito: true,
				type: 'normal',
				tabs: [
					{
						id: createTestTabId(10),
						active: true,
						pinned: true,
						muted: true,
						groupId: createTestGroupId(5),
					},
					{
						id: createTestTabId(11),
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
		const result = await adapter.getAllWindows(true);

		expect(result[0]?.type).toBe('unknown');
	});

	it('filters out windows that do not have valid IDs', async () => {
		const invalidWindow: chrome.windows.Window = {
			...createMockChromeWindow(2, [{ id: 2 }]),
			id: 0,
		};
		VitestChrome.windows.getAll.mockResolvedValue([
			createMockChromeWindow(1, [{ id: 1 }]),
			invalidWindow,
		]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toEqual(createTestWindowId(1));
	});

	it('filters out tabs with invalid IDs', async () => {
		const invalidTab: chrome.tabs.Tab = {
			...createMockChromeTab(12),
			id: 0,
		};
		VitestChrome.windows.getAll.mockResolvedValue([
			{
				...createMockChromeWindow(1),
				tabs: [createMockChromeTab(11), invalidTab],
			},
		]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(result[0]?.tabs).toHaveLength(1);
		expect(result[0]?.tabs[0]?.id).toEqual(createTestTabId(11));
	});

	it('propagates errors from chrome.windows.getAll', async () => {
		VitestChrome.windows.getAll.mockRejectedValue(new Error('Chrome API error'));

		const adapter = createChromeWindowAdapter();

		await expect(adapter.getAllWindows(true)).rejects.toThrow('Chrome API error');
	});
});
