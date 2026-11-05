import { describe, expect, it } from 'vitest';
import { mergeWindows } from '../../../src/application/merge-windows';
import {
	createTestGroupId,
	createTestTabId,
	createTestWindowId,
	createMockTabSnapshot as tab,
	createMockWindowSnapshot as window,
} from '../../factories/domain';
import { createMockMergeWindowsDeps } from '../../mocks/ports';

describe('merging windows', () => {
	it('restores pinning and mute without resetting false values, then activates the target tab', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			window(1, [tab(1, { active: true })]),
			window(2, [
				tab(2, { pinned: true, muted: true }),
				tab(3, { pinned: true }),
				tab(4, { muted: true }),
				tab(5),
			]),
		]);
		expect(await mergeWindows(false, deps)).toEqual({
			ok: true,
			data: { targetWindowId: createTestWindowId(1), activeTabId: createTestTabId(1) },
		});
		const destination = { windowId: createTestWindowId(1), index: -1 };
		expect(deps.mocks.moveTabs.mock.calls).toEqual([
			[[createTestTabId(2)], destination],
			[[createTestTabId(3)], destination],
			[[createTestTabId(4), createTestTabId(5)], destination],
		]);
		expect(deps.mocks.updateTab).toHaveBeenCalledTimes(5);
		expect(deps.mocks.updateTab.mock.calls).toEqual(
			expect.arrayContaining([
				[createTestTabId(2), { pinned: true }],
				[createTestTabId(3), { pinned: true }],
				[createTestTabId(2), { muted: true }],
				[createTestTabId(4), { muted: true }],
				[createTestTabId(1), { active: true }],
			])
		);
	});

	it('uses the trigger first and remaining windows by ID, not focus or API array order', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			window(3, [tab(3, { active: true })], { focused: true }),
			window(2, [tab(2, { active: true })]),
			window(1, [tab(1, { active: true })]),
		]);
		await mergeWindows(false, deps, createTestWindowId(2));
		expect(deps.mocks.moveTabs.mock.calls).toEqual([
			[[createTestTabId(1)], { windowId: createTestWindowId(2), index: -1 }],
			[[createTestTabId(3)], { windowId: createTestWindowId(2), index: -1 }],
		]);
		expect(deps.mocks.updateTab).toHaveBeenLastCalledWith(createTestTabId(2), { active: true });
	});

	it('ignores a popup trigger and excludes normal and tabless windows from an incognito merge', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			window(1, [tab(1, { active: true })], { incognito: true }),
			window(2, [tab(2, { active: true })], { incognito: true, focused: true }),
			window(3, [tab(3, { active: true })], { incognito: true, type: 'popup' }),
			window(4, [tab(4, { active: true })]),
			window(5, [], { incognito: true }),
		]);
		await mergeWindows(true, deps, createTestWindowId(3));
		expect(deps.mocks.moveTabs).toHaveBeenCalledExactlyOnceWith([createTestTabId(1)], {
			windowId: createTestWindowId(2),
			index: -1,
		});
		expect(deps.mocks.updateTab).toHaveBeenCalledExactlyOnceWith(createTestTabId(2), {
			active: true,
		});
	});

	it('captures group state before any moves and restores it after activation', async () => {
		const deps = createMockMergeWindowsDeps();
		const targetGroup = createTestGroupId(0);
		const sourceGroup = createTestGroupId(1);
		deps.mocks.getAllWindows.mockResolvedValue([
			window(1, [tab(1, { active: true }), tab(2, { groupId: targetGroup })]),
			window(2, [tab(3), tab(4, { groupId: sourceGroup }), tab(5, { groupId: sourceGroup })]),
		]);
		deps.mocks.getCollapsed.mockImplementation(async (group) => group.value === 1);
		await mergeWindows(false, deps);
		expect(deps.mocks.getCollapsed.mock.calls).toEqual(
			expect.arrayContaining([[targetGroup], [sourceGroup]])
		);
		expect(deps.mocks.getCollapsed.mock.invocationCallOrder.at(-1)).toBeLessThan(
			deps.mocks.moveTabs.mock.invocationCallOrder[0]
		);
		expect(deps.mocks.moveGroup).toHaveBeenCalledExactlyOnceWith(sourceGroup, {
			windowId: createTestWindowId(1),
			index: -1,
		});
		expect(deps.mocks.setCollapsed).toHaveBeenCalledTimes(2);
		expect(deps.mocks.setCollapsed.mock.calls).toEqual(
			expect.arrayContaining([
				[targetGroup, false],
				[sourceGroup, true],
			])
		);
		expect(deps.mocks.setCollapsed.mock.invocationCallOrder[0]).toBeGreaterThan(
			deps.mocks.updateTab.mock.invocationCallOrder.at(-1) ?? 0
		);
	});

	it('does not start a merge when filtering leaves fewer than two windows', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			window(1, [tab(1, { active: true })]),
			window(2, [tab(2)], { incognito: true }),
		]);
		expect(await mergeWindows(false, deps)).toMatchObject({
			ok: false,
			error: { type: 'insufficient-windows' },
		});
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
		expect(deps.mocks.updateTab).not.toHaveBeenCalled();
	});
});
