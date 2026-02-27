/**
 * Tests for Chrome TabGroup Adapter.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeTabGroupAdapter } from '../../../../src/adapters/chrome/tab-group';
import { createTestGroupId, createTestWindowId } from '../../../helpers/domain-factories';
import { resetChromeMocks, VitestChrome } from '../../../mocks/chrome';

/**
 * Creates a required group ID for tests.
 * @param value - Raw group ID.
 * @returns Group ID.
 */
const createRequiredGroupId = (value: number) => {
	const groupId = createTestGroupId(value);
	if (groupId === null) {
		throw new Error(`Invalid group id in test: ${value}`);
	}

	return groupId;
};

describe('Chrome TabGroup Adapter', () => {
	beforeEach(() => {
		resetChromeMocks();
	});

	it('moves a tab group to target window', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(5), {
			windowId: createTestWindowId(1),
			index: -1,
		});

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(5, {
			windowId: 1,
			index: -1,
		});
	});

	it('preserves moveProperties index value', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(5), {
			windowId: createTestWindowId(1),
			index: 3,
		});

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(5, {
			windowId: 1,
			index: 3,
		});
	});

	it('handles index -1 for append behavior', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(5), {
			windowId: createTestWindowId(2),
			index: -1,
		});

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(5, {
			windowId: 2,
			index: -1,
		});
	});

	it('accepts positive group IDs only', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(1), {
			windowId: createTestWindowId(1),
			index: 0,
		});

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(1, {
			windowId: 1,
			index: 0,
		});
	});

	it('completes without error for valid inputs', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();

		await expect(
			adapter.moveGroup(createRequiredGroupId(10), {
				windowId: createTestWindowId(1),
				index: 5,
			})
		).resolves.not.toThrow();
	});

	it('calls chrome.tabGroups.move with expected parameters', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(7), {
			windowId: createTestWindowId(3),
			index: 2,
		});

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledTimes(1);
		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(7, {
			windowId: 3,
			index: 2,
		});
	});

	it('propagates chrome.tabGroups.move rejection', async () => {
		VitestChrome.tabGroups.move.mockRejectedValue(new Error('Group not found'));

		const adapter = createChromeTabGroupAdapter();

		await expect(
			adapter.moveGroup(createRequiredGroupId(999), {
				windowId: createTestWindowId(1),
				index: 0,
			})
		).rejects.toThrow('Group not found');
	});

	it('handles multiple sequential moves', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(1), {
			windowId: createTestWindowId(1),
			index: 0,
		});
		await adapter.moveGroup(createRequiredGroupId(2), {
			windowId: createTestWindowId(1),
			index: 1,
		});
		await adapter.moveGroup(createRequiredGroupId(3), {
			windowId: createTestWindowId(2),
			index: 0,
		});

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

	it('does not mutate input moveProperties object', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		const moveProperties = { windowId: createTestWindowId(1), index: 5 } as const;
		const originalWindowId = moveProperties.windowId.value;
		const originalIndex = moveProperties.index;

		await adapter.moveGroup(createRequiredGroupId(10), moveProperties);

		expect(moveProperties.windowId.value).toBe(originalWindowId);
		expect(moveProperties.index).toBe(originalIndex);
	});
});
