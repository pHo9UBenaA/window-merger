/**
 * Tests for Chrome Tab Adapter.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeTabAdapter } from '../../../../src/adapters/chrome/tab';
import { createTestTabId, createTestWindowId } from '../../../helpers/domain-factories';
import { resetChromeMocks, VitestChrome } from '../../../mocks/chrome';

describe('Chrome Tab Adapter', () => {
	beforeEach(() => {
		resetChromeMocks();
	});

	it('moves a single tab by ID', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([createTestTabId(123)], {
			windowId: createTestWindowId(1),
			index: -1,
		});

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([123], {
			windowId: 1,
			index: -1,
		});
	});

	it('moves multiple tabs by ID array', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([createTestTabId(1), createTestTabId(2), createTestTabId(3)], {
			windowId: createTestWindowId(2),
			index: 0,
		});

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([1, 2, 3], {
			windowId: 2,
			index: 0,
		});
	});

	it('handles empty tab array without calling Chrome API', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([], { windowId: createTestWindowId(1), index: -1 });

		expect(VitestChrome.tabs.move).not.toHaveBeenCalled();
	});

	it('preserves moveProperties index value', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([createTestTabId(1)], { windowId: createTestWindowId(1), index: 5 });

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([1], {
			windowId: 1,
			index: 5,
		});
	});

	it('updates tab with pinned property', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(createTestTabId(42), { pinned: true });

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: true,
			muted: undefined,
			active: undefined,
		});
	});

	it('updates tab with muted property', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(createTestTabId(42), { muted: true });

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: undefined,
			muted: true,
			active: undefined,
		});
	});

	it('updates tab with active property', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(createTestTabId(42), { active: true });

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: undefined,
			muted: undefined,
			active: true,
		});
	});

	it('updates tab with multiple properties', async () => {
		VitestChrome.tabs.update.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.updateTab(createTestTabId(42), {
			pinned: true,
			muted: true,
			active: false,
		});

		expect(VitestChrome.tabs.update).toHaveBeenCalledWith(42, {
			pinned: true,
			muted: true,
			active: false,
		});
	});

	it('converts readonly tab ID arrays for Chrome API', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		const tabIds = [createTestTabId(1), createTestTabId(2), createTestTabId(3)] as const;
		await adapter.moveTabs(tabIds, { windowId: createTestWindowId(1), index: 0 });

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([1, 2, 3], {
			windowId: 1,
			index: 0,
		});
	});

	it('handles chrome.tabs.move rejection', async () => {
		VitestChrome.tabs.move.mockRejectedValue(new Error('Chrome API error'));

		const adapter = createChromeTabAdapter();

		await expect(
			adapter.moveTabs([createTestTabId(1)], { windowId: createTestWindowId(1), index: 0 })
		).rejects.toThrow('Chrome API error');
	});

	it('handles chrome.tabs.update rejection', async () => {
		VitestChrome.tabs.update.mockRejectedValue(new Error('Tab not found'));

		const adapter = createChromeTabAdapter();

		await expect(adapter.updateTab(createTestTabId(999), { pinned: true })).rejects.toThrow(
			'Tab not found'
		);
	});

	it('keeps destination window ID from domain object', async () => {
		VitestChrome.tabs.move.mockResolvedValue(undefined);

		const adapter = createChromeTabAdapter();
		await adapter.moveTabs([createTestTabId(7)], {
			windowId: createTestWindowId(22),
			index: 1,
		});

		expect(VitestChrome.tabs.move).toHaveBeenCalledWith([7], {
			windowId: 22,
			index: 1,
		});
	});
});
