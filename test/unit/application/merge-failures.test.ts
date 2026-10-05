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
	it('awaits each group before starting the next and stops on failure', async () => {
		const deps = createDeps();
		const pending = Promise.withResolvers<void>();
		const error = new Error('Group disappeared');
		deps.mocks.moveGroup.mockReturnValueOnce(pending.promise);
		const settled = vi.fn();
		const result = mergeWindows(false, deps).catch(settled);
		await vi.waitFor(() => expect(deps.mocks.moveGroup).toHaveBeenCalledOnce());
		expect(settled).not.toHaveBeenCalled();
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
		pending.reject(error);
		await result;
		expect(settled).toHaveBeenCalledExactlyOnceWith(error);
		expect(deps.mocks.moveGroup).toHaveBeenCalledOnce();
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
		expect(deps.mocks.updateTab).not.toHaveBeenCalled();
	});

	it('propagates synchronous port exceptions without starting more work', async () => {
		const deps = createDeps();
		const error = new Error('First');
		deps.mocks.moveGroup.mockImplementationOnce(() => {
			throw error;
		});
		await expect(mergeWindows(false, deps)).rejects.toBe(error);
		expect(deps.mocks.moveGroup).toHaveBeenCalledOnce();
	});

	it('awaits repinning before the next move and stops on pin failure', async () => {
		const deps = createDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			window(1, [tab(1, { active: true })]),
			window(2, [tab(2, { pinned: true, muted: true }), tab(3, { pinned: true })]),
		]);
		const pending = Promise.withResolvers<void>();
		deps.mocks.updateTab.mockReturnValueOnce(pending.promise);
		const settled = vi.fn();
		const result = mergeWindows(false, deps).catch(settled);
		await vi.waitFor(() => expect(deps.mocks.updateTab).toHaveBeenCalledOnce());
		expect(deps.mocks.moveTabs).toHaveBeenCalledOnce();
		expect(settled).not.toHaveBeenCalled();
		pending.reject(new Error('Pin failed'));
		await result;
		expect(settled).toHaveBeenCalledOnce();
		expect(deps.mocks.moveTabs).toHaveBeenCalledOnce();
		expect(deps.mocks.updateTab).toHaveBeenCalledOnce();
	});

	it.each(['getAllWindows', 'moveTabs', 'updateTab', 'getCollapsed', 'setCollapsed'] as const)(
		'propagates %s failure to the event boundary',
		async (method) => {
			const deps = createDeps();
			const error = new Error('API failure');
			deps.mocks[method].mockRejectedValue(error);
			await expect(mergeWindows(false, deps)).rejects.toThrow('API failure');
		}
	);
});
