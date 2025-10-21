/**
 * Tests for Chrome Tab Adapter.
 * Verifies that the adapter correctly implements TabPort contract
 * and properly integrates with Chrome Tabs API.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeTabAdapter } from '../../../../src/adapters/chrome/tab';
import { createMockChromeTab } from '../../../helpers/chrome-factories';
import { resetChromeMocks, VitestChrome } from '../../../mocks/chrome';

describe('Chrome Tab Adapter', () => {
	beforeEach(() => {
		resetChromeMocks();
	});

	it('should move a single tab by ID', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([123], { windowId: 1, index: -1 });

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([123], {
			windowId: 1,
			index: -1,
		});
	});

	it('should move multiple tabs by ID array', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([1, 2, 3], { windowId: 2, index: 0 });

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([1, 2, 3], {
			windowId: 2,
			index: 0,
		});
	});

	it('should handle empty tab array', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();

		// Should not throw
		await expect(adapter.moveTabs([], { windowId: 1, index: -1 })).resolves.not.toThrow();
	});

	it('should preserve moveProperties.index value', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([1], { windowId: 1, index: 5 });

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([1], {
			windowId: 1,
			index: 5,
		});
	});

	it('should update tab with pinned property', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(42, { pinned: true });

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: true,
			muted: undefined,
			active: undefined,
		});
	});

	it('should update tab with muted property', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(42, { muted: true });

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: undefined,
			muted: true,
			active: undefined,
		});
	});

	it('should update tab with active property', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(42, { active: true });

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: undefined,
			muted: undefined,
			active: true,
		});
	});

	it('should update tab with multiple properties', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(42, { pinned: true, muted: true, active: false });

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: true,
			muted: true,
			active: false,
		});
	});

	it('should return tabs for a window', async () => {
		const mockTabs = [
			createMockChromeTab(1, { pinned: false, groupId: -1 }),
			createMockChromeTab(2, { pinned: true, groupId: -1 }),
		];
		VitestChrome.tabs.query.mockResolvedValue(mockTabs);

		const adapter = createChromeTabAdapter();
		const result = await adapter.queryTabs(1);

		expect(Array.isArray(result)).toBe(true);
		expect(result).toEqual(mockTabs);
	});

	it('should return empty array for window with no tabs', async () => {
		VitestChrome.tabs.query.mockResolvedValue([]);

		const adapter = createChromeTabAdapter();
		const result = await adapter.queryTabs(999);

		expect(result).toEqual([]);
	});

	it('should call chrome.tabs.query with windowId', async () => {
		VitestChrome.tabs.query.mockResolvedValue([]);

		const adapter = createChromeTabAdapter();
		await adapter.queryTabs(5);

		expect(VitestChrome.tabs.query).toHaveBeenCalledWith({ windowId: 5 });
	});

	it('should convert readonly array to mutable array for Chrome API', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabAdapter();
		const readonlyTabIds: readonly number[] = [1, 2, 3];
		await adapter.moveTabs(readonlyTabIds, { windowId: 1, index: 0 });

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([1, 2, 3], {
			windowId: 1,
			index: 0,
		});
	});

	it('should handle chrome.tabs.move rejection', async () => {
		const error = new Error('Chrome API error');
		VitestChrome.tabs.move.mockRejectedValue(error);

		const adapter = createChromeTabAdapter();

		await expect(adapter.moveTabs([1], { windowId: 1, index: 0 })).rejects.toThrow(
			'Chrome API error'
		);
	});

	it('should handle chrome.tabs.update rejection', async () => {
		const error = new Error('Tab not found');
		VitestChrome.tabs.update.mockRejectedValue(error);

		const adapter = createChromeTabAdapter();

		await expect(adapter.updateTab(999, { pinned: true })).rejects.toThrow('Tab not found');
	});

	it('should handle chrome.tabs.query rejection', async () => {
		const error = new Error('Window not found');
		VitestChrome.tabs.query.mockRejectedValue(error);

		const adapter = createChromeTabAdapter();

		await expect(adapter.queryTabs(999)).rejects.toThrow('Window not found');
	});

	it('should preserve tab properties', async () => {
		const mockTabs = [
			createMockChromeTab(1, {
				pinned: true,
				groupId: 5,
				active: true,
				url: 'https://example.com',
			}),
			createMockChromeTab(2, {
				pinned: false,
				groupId: -1,
				active: false,
				url: 'https://test.com',
			}),
		];
		VitestChrome.tabs.query.mockResolvedValue(mockTabs);

		const adapter = createChromeTabAdapter();
		const result = await adapter.queryTabs(1);

		expect(result[0]).toMatchObject({
			id: 1,
			pinned: true,
			groupId: 5,
			active: true,
			url: 'https://example.com',
		});
		expect(result[1]).toMatchObject({
			id: 2,
			pinned: false,
			groupId: -1,
			active: false,
			url: 'https://test.com',
		});
	});
});
