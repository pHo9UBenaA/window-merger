/**
 * Tests for Chrome TabGroup Adapter.
 * Verifies that the adapter correctly implements TabGroupPort contract
 * and properly integrates with Chrome TabGroups API.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeTabGroupAdapter } from '../../../../src/adapters/chrome/tab-group';
import { resetChromeMocks, VitestChrome } from '../../../mocks/chrome';

describe('Chrome TabGroup Adapter', () => {
	beforeEach(() => {
		resetChromeMocks();
	});

	it('should move a tab group to target window', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(5, { windowId: 1, index: -1 });

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(5, {
			windowId: 1,
			index: -1,
		});
	});

	it('should preserve moveProperties.index value', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(5, { windowId: 1, index: 3 });

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(5, {
			windowId: 1,
			index: 3,
		});
	});

	it('should handle index -1 (append to end)', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(5, { windowId: 2, index: -1 });

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(5, {
			windowId: 2,
			index: -1,
		});
	});

	it('should handle positive group IDs only', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(1, { windowId: 1, index: 0 });

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(1, {
			windowId: 1,
			index: 0,
		});
	});

	it('should complete without error for valid inputs', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();

		// Should not throw
		await expect(adapter.moveGroup(10, { windowId: 1, index: 5 })).resolves.not.toThrow();
	});

	it('should call chrome.tabGroups.move with correct parameters', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(7, { windowId: 3, index: 2 });

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledTimes(1);
		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(7, {
			windowId: 3,
			index: 2,
		});
	});

	it('should handle chrome.tabGroups.move rejection', async () => {
		const error = new Error('Group not found');
		VitestChrome.tabGroups.move.mockRejectedValue(error);

		const adapter = createChromeTabGroupAdapter();

		await expect(adapter.moveGroup(999, { windowId: 1, index: 0 })).rejects.toThrow(
			'Group not found'
		);
	});

	it('should handle multiple sequential moves', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();

		await adapter.moveGroup(1, { windowId: 1, index: 0 });
		await adapter.moveGroup(2, { windowId: 1, index: 1 });
		await adapter.moveGroup(3, { windowId: 2, index: 0 });

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledTimes(3);
		expect(VitestChrome.tabGroups.move).toHaveBeenNthCalledWith(1, 1, {
			windowId: 1,
			index: 0,
		});
		expect(VitestChrome.tabGroups.move).toHaveBeenNthCalledWith(2, 2, {
			windowId: 1,
			index: 1,
		});
		expect(VitestChrome.tabGroups.move).toHaveBeenNthCalledWith(3, 3, {
			windowId: 2,
			index: 0,
		});
	});

	it('should not modify moveProperties object', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined as never);

		const adapter = createChromeTabGroupAdapter();
		const moveProps = { windowId: 1, index: 5 } as const;
		const originalProps = { ...moveProps };

		await adapter.moveGroup(10, moveProps);

		expect(moveProps).toEqual(originalProps);
	});
});
