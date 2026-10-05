import { describe, expect, it } from 'vitest';
import { mergeWindows } from '../../../src/application/merge-windows';
import {
	createMockTabSnapshot,
	createMockWindowSnapshot,
	createTestGroupId,
	createTestTabId,
	createTestWindowId,
} from '../../factories/domain';
import { createMockMergeWindowsDeps } from '../../mocks/ports';

describe('App Layer - Merge Windows', () => {
	it('restores pinning sequentially and mute separately without resetting false values', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: true })]),
			createMockWindowSnapshot(2, [
				createMockTabSnapshot(2, { pinned: true, muted: true }),
				createMockTabSnapshot(3, { pinned: true }),
				createMockTabSnapshot(4, { muted: true }),
				createMockTabSnapshot(5),
			]),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		const destination = { windowId: createTestWindowId(1), index: -1 };
		expect(deps.mocks.moveTabs.mock.calls).toEqual([
			[[createTestTabId(2)], destination],
			[[createTestTabId(3)], destination],
			[[createTestTabId(4), createTestTabId(5)], destination],
		]);
		expect(deps.mocks.updateTab.mock.calls).toEqual([
			[createTestTabId(2), { pinned: true }],
			[createTestTabId(3), { pinned: true }],
			[createTestTabId(2), { muted: true }],
			[createTestTabId(4), { muted: true }],
			[createTestTabId(1), { active: true }],
		]);
		expect(deps.mocks.updateTab).toHaveBeenLastCalledWith(createTestTabId(1), { active: true });
	});

	it('moves and repins each pinned tab before the interleaved strip in index order', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: true })]),
			createMockWindowSnapshot(
				2,
				[
					createMockTabSnapshot(2, { pinned: true }),
					createMockTabSnapshot(3, { pinned: true }),
					createMockTabSnapshot(4),
					createMockTabSnapshot(5, { groupId: createTestGroupId(0) }),
					createMockTabSnapshot(6, { groupId: createTestGroupId(0) }),
					createMockTabSnapshot(7),
					createMockTabSnapshot(8),
					createMockTabSnapshot(9, { groupId: createTestGroupId(1) }),
					createMockTabSnapshot(10, { groupId: createTestGroupId(1) }),
					createMockTabSnapshot(11),
				].toReversed()
			),
		]);
		await mergeWindows(false, deps);
		const { moveTabs, updateTab, moveGroup } = deps.mocks;
		expect(moveTabs.mock.calls.map(([ids]) => ids.map((id) => id.value))).toEqual([
			[2],
			[3],
			[4],
			[7, 8],
			[11],
		]);
		expect(moveGroup.mock.calls.map(([id]) => id.value)).toEqual([0, 1]);
		const order = [
			moveTabs.mock.invocationCallOrder[0],
			updateTab.mock.invocationCallOrder[0],
			moveTabs.mock.invocationCallOrder[1],
			updateTab.mock.invocationCallOrder[1],
			moveTabs.mock.invocationCallOrder[2],
			moveGroup.mock.invocationCallOrder[0],
			moveTabs.mock.invocationCallOrder[3],
			moveGroup.mock.invocationCallOrder[1],
			moveTabs.mock.invocationCallOrder[4],
			updateTab.mock.invocationCallOrder[2],
		];
		expect(order).toEqual(order.toSorted((a, b) => a - b));
	});

	it('uses the trigger first and remaining windows by ID, not focus or API array order', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(3, [createMockTabSnapshot(3, { active: true })], {
				focused: true,
			}),
			createMockWindowSnapshot(2, [createMockTabSnapshot(2, { active: true })]),
			createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: true })]),
		]);
		await mergeWindows(false, deps, createTestWindowId(2));
		expect(deps.mocks.moveTabs.mock.calls).toEqual([
			[[createTestTabId(1)], { windowId: createTestWindowId(2), index: -1 }],
			[[createTestTabId(3)], { windowId: createTestWindowId(2), index: -1 }],
		]);
		expect(deps.mocks.updateTab).toHaveBeenLastCalledWith(createTestTabId(2), { active: true });
	});

	it.each(['incognito', 'popup', 'invalid', 'absent'] as const)(
		'falls back when the trigger is %s',
		async (reason) => {
			const deps = createMockMergeWindowsDeps();
			const ineligible = createMockWindowSnapshot(
				3,
				[createMockTabSnapshot(3, { active: true })],
				{
					incognito: reason === 'incognito',
					type: reason === 'popup' ? 'popup' : 'normal',
				}
			);
			deps.mocks.getAllWindows.mockResolvedValue([
				createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: true })]),
				createMockWindowSnapshot(2, [createMockTabSnapshot(2, { active: true })], {
					focused: true,
				}),
				...(reason === 'absent'
					? []
					: [
							{
								...ineligible,
								id: {
									kind: 'WindowId' as const,
									value: reason === 'invalid' ? -1 : 3,
								},
							},
						]),
			]);
			await mergeWindows(false, deps, {
				kind: 'WindowId',
				value: reason === 'invalid' ? -1 : 3,
			});
			expect(deps.mocks.moveTabs).toHaveBeenCalledExactlyOnceWith([createTestTabId(1)], {
				windowId: createTestWindowId(2),
				index: -1,
			});
		}
	);

	it('snapshots collapsed state once per group before moves and restores it after activation', async () => {
		const deps = createMockMergeWindowsDeps();
		const targetGroup = createTestGroupId(0);
		const sourceGroup = createTestGroupId(1);
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [
				createMockTabSnapshot(1, { active: true }),
				createMockTabSnapshot(2, { groupId: targetGroup }),
			]),
			createMockWindowSnapshot(2, [
				createMockTabSnapshot(3),
				createMockTabSnapshot(4, { groupId: sourceGroup }),
				createMockTabSnapshot(5, { groupId: sourceGroup }),
			]),
		]);
		deps.mocks.getCollapsed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		await mergeWindows(false, deps);
		expect(deps.mocks.getCollapsed.mock.calls).toEqual([[targetGroup], [sourceGroup]]);
		expect(deps.mocks.getCollapsed.mock.invocationCallOrder.at(-1)).toBeLessThan(
			deps.mocks.moveTabs.mock.invocationCallOrder[0]
		);
		expect(deps.mocks.setCollapsed.mock.calls).toEqual([
			[targetGroup, false],
			[sourceGroup, true],
		]);
		expect(deps.mocks.setCollapsed.mock.invocationCallOrder[0]).toBeGreaterThan(
			deps.mocks.updateTab.mock.invocationCallOrder.at(-1) as number
		);
	});

	it('preserves tab groups after merging', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(3, { active: true })]),
			createMockWindowSnapshot(2, [
				createMockTabSnapshot(1, { groupId: createTestGroupId(1) }),
				createMockTabSnapshot(2, { groupId: createTestGroupId(1) }),
			]),
		]);

		await mergeWindows(false, deps);

		expect(deps.mocks.moveGroup).toHaveBeenCalledWith(createTestGroupId(1), {
			windowId: createTestWindowId(1),
			index: -1,
		});
	});

	it('returns insufficient-windows error when only one window is available', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: true })]),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('insufficient-windows');
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('does not mix normal and incognito windows', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: true })], {
				incognito: false,
			}),
			createMockWindowSnapshot(2, [createMockTabSnapshot(2, { active: true })], {
				incognito: true,
			}),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('insufficient-windows');
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('returns insufficient-windows error when windows have no valid tabs', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, []),
			createMockWindowSnapshot(2, [createMockTabSnapshot(1, { active: true })]),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('insufficient-windows');
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('prioritizes focused window as merge target', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(1)]),
			createMockWindowSnapshot(2, [createMockTabSnapshot(2, { active: true })], {
				focused: true,
			}),
		]);

		await mergeWindows(false, deps);

		const firstCall = deps.mocks.moveTabs.mock.calls[0];
		expect(firstCall).toBeDefined();
		expect(firstCall?.[1].windowId).toEqual(createTestWindowId(2));
	});

	it('preserves focus on focused window active tab', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [
				createMockTabSnapshot(1, { active: true }),
				createMockTabSnapshot(2, { active: false }),
			]),
			createMockWindowSnapshot(
				2,
				[
					createMockTabSnapshot(3, { active: true }),
					createMockTabSnapshot(4, { active: false }),
				],
				{
					focused: true,
				}
			),
		]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(createTestTabId(3), { active: true });
	});

	it('returns no-active-tab error when all tabs are inactive', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: false })], {
				focused: true,
			}),
			createMockWindowSnapshot(2, [createMockTabSnapshot(2, { active: false })]),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.type).toBe('no-active-tab');
		}
	});
});
