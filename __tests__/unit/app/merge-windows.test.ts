/**
 * Integration tests for merge windows use case.
 */

import { describe, expect, it } from 'vitest';
import { mergeWindows } from '../../../src/app/merge-windows';
import {
	createMockTabSnapshot,
	createMockWindowSnapshot,
	createTestGroupId,
	createTestTabId,
	createTestWindowId,
} from '../../helpers/domain-factories';
import { createMockMergeWindowsDeps } from '../../helpers/port-mocks';

describe('App Layer - Merge Windows', () => {
	it('merges multiple windows together', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(3, { active: true })]),
			createMockWindowSnapshot(2, [createMockTabSnapshot(1), createMockTabSnapshot(2)]),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		expect(deps.mocks.getAllWindows).toHaveBeenCalledWith(true);
		expect(deps.mocks.moveTabs).toHaveBeenCalled();
	});

	it('retains pinned tabs after merging', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(3, { active: true })]),
			createMockWindowSnapshot(2, [
				createMockTabSnapshot(1),
				createMockTabSnapshot(2, { pinned: true }),
			]),
		]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(createTestTabId(2), { pinned: true });
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

	it('does nothing when only one window exists', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(1, { active: true })]),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBeNull();
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

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBeNull();
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('safely skips windows with no tabs', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, []),
			createMockWindowSnapshot(2, [createMockTabSnapshot(1, { active: true })]),
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBeNull();
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('retains muted state after merging', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [createMockTabSnapshot(3, { active: true })]),
			createMockWindowSnapshot(2, [
				createMockTabSnapshot(1, { muted: true }),
				createMockTabSnapshot(2, { muted: false }),
			]),
		]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(createTestTabId(1), { muted: true });
		expect(deps.mocks.updateTab).not.toHaveBeenCalledWith(createTestTabId(2), { muted: true });
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

	it('restores focus to the active tab after merge', async () => {
		const deps = createMockMergeWindowsDeps();
		deps.mocks.getAllWindows.mockResolvedValue([
			createMockWindowSnapshot(1, [
				createMockTabSnapshot(1, { active: true }),
				createMockTabSnapshot(2, { active: false }),
			]),
			createMockWindowSnapshot(2, [
				createMockTabSnapshot(3, { active: false }),
				createMockTabSnapshot(4, { active: false }),
			]),
		]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(createTestTabId(1), { active: true });
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
