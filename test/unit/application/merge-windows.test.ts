import { describe, expect, it } from 'vitest';
import { mergeWindows } from '../../../src/application/merge-windows';
import {
	createTestTabId,
	createTestWindowId,
	createMockTabSnapshot as tab,
	createMockWindowSnapshot as window,
} from '../../factories/domain';
import { createMockMergeWindowsDeps } from '../../mocks/ports';

describe('merging windows', () => {
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
