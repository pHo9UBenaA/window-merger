import { describe, expect, it, vi } from 'vitest';
import { mergeWindows } from '../../../src/application/merge-windows';
import {
	createTestGroupId,
	createMockTabSnapshot as tab,
	createMockWindowSnapshot as window,
} from '../../factories/domain';
import { createMockMergeWindowsDeps } from '../../mocks/ports';

const createDeps = () => {
	const deps = createMockMergeWindowsDeps();
	deps.mocks.getAllWindows.mockResolvedValue([
		window(1, [tab(1, { active: true })]),
		window(2, [
			tab(2, { groupId: createTestGroupId(0) }),
			tab(3, { groupId: createTestGroupId(1) }),
			tab(4),
		]),
		window(3, [tab(5)]),
	]);
	return deps;
};

describe('merge failures', () => {
	it('waits for started groups and stops unstarted work after failure', async () => {
		const deps = createDeps();
		const pending = Promise.withResolvers<void>();
		const error = new Error('Group disappeared');
		deps.mocks.moveGroup.mockRejectedValueOnce(error).mockReturnValueOnce(pending.promise);
		const settled = vi.fn();
		const result = mergeWindows(false, deps).catch(settled);
		await vi.waitFor(() => expect(deps.mocks.moveGroup).toHaveBeenCalledTimes(2));
		expect(settled).not.toHaveBeenCalled();
		pending.resolve();
		await result;
		expect(settled.mock.calls[0][0].errors).toEqual([error]);
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
		expect(deps.mocks.updateTab).not.toHaveBeenCalled();
	});

	it('collects all group failures, including synchronous port exceptions', async () => {
		const deps = createDeps();
		const errors = [new Error('First'), new Error('Second')];
		deps.mocks.moveGroup
			.mockImplementationOnce(() => {
				throw errors[0];
			})
			.mockRejectedValueOnce(errors[1]);
		await expect(mergeWindows(false, deps)).rejects.toMatchObject({ errors });
		expect(deps.mocks.moveGroup).toHaveBeenCalledTimes(2);
	});

	it('waits for started attribute updates after one fails', async () => {
		const deps = createDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			window(1, [tab(1, { active: true })]),
			window(2, [tab(2, { pinned: true, muted: true }), tab(3, { muted: true })]),
		]);
		const pending = Promise.withResolvers<void>();
		deps.mocks.updateTab
			.mockRejectedValueOnce(new Error('Pin failed'))
			.mockReturnValueOnce(pending.promise);
		const settled = vi.fn();
		const result = mergeWindows(false, deps).catch(settled);
		await vi.waitFor(() => expect(deps.mocks.updateTab).toHaveBeenCalledTimes(2));
		expect(settled).not.toHaveBeenCalled();
		pending.resolve();
		await result;
		expect(settled).toHaveBeenCalledOnce();
		expect(deps.mocks.updateTab).toHaveBeenCalledTimes(2);
	});

	it.each([
		'getAllWindows',
		'moveTabs',
		'updateTab',
	] as const)('propagates %s failure to the event boundary', async (method) => {
		const deps = createDeps();
		const error = new Error('API failure');
		deps.mocks[method].mockRejectedValue(error);
		await expect(mergeWindows(false, deps)).rejects.toThrow('API failure');
	});
});
