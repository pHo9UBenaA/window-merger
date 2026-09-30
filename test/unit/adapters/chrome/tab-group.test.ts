import { describe, expect, it } from 'vitest';
import { createChromeTabGroupAdapter } from '../../../../src/adapters/chrome/tab-group';
import { createTestGroupId, createTestWindowId } from '../../../factories/domain';
import { VitestChrome } from '../../../mocks/chrome';

const createRequiredGroupId = (value: number) => {
	const groupId = createTestGroupId(value);
	if (groupId === null) {
		throw new Error(`Invalid group id in test: ${value}`);
	}

	return groupId;
};

describe('Chrome TabGroup Adapter', () => {
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

	it('preserves group ID zero', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(0), {
			windowId: createTestWindowId(1),
			index: 0,
		});

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledWith(0, {
			windowId: 1,
			index: 0,
		});
	});

	it('forwards destination properties without mutating the input', async () => {
		VitestChrome.tabGroups.move.mockResolvedValue(undefined);
		const destination = Object.freeze({
			windowId: Object.freeze(createTestWindowId(3)),
			index: 2,
		});

		const adapter = createChromeTabGroupAdapter();
		await adapter.moveGroup(createRequiredGroupId(7), destination);

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
			windowId: createTestWindowId(2),
			index: 1,
		});

		expect(VitestChrome.tabGroups.move).toHaveBeenCalledTimes(2);
		expect(VitestChrome.tabGroups.move).toHaveBeenNthCalledWith(1, 1, {
			windowId: 1,
			index: 0,
		});
		expect(VitestChrome.tabGroups.move).toHaveBeenNthCalledWith(2, 2, {
			windowId: 2,
			index: 1,
		});
	});
});
