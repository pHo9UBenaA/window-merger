/**
 * Integration tests for merge windows use case.
 * Tests the orchestration logic with mocked port implementations.
 *
 * Test Strategy:
 * - Uses type-safe mocks that satisfy MergeWindowsDeps interface
 * - Mock behavior is verified to match expected port contracts
 * - Tests cover business logic orchestration, not Chrome API details
 */

import { describe, expect, it } from 'vitest';
import { mergeWindows } from '../../../src/app/merge-windows';
import { createMockChromeWindow } from '../../helpers/chrome-factories';
import { createMockMergeWindowsDeps } from '../../helpers/port-mocks';

describe('App Layer - Merge Windows', () => {
	it('merges multiple windows together', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [{ id: 3, active: true }]),
			createMockChromeWindow(2, [{ id: 1 }, { id: 2, pinned: true }]),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);
		deps.mocks.queryTabs.mockResolvedValue([
			{ id: 1, groupId: -1, pinned: false } as chrome.tabs.Tab,
			{ id: 2, groupId: -1, pinned: true } as chrome.tabs.Tab,
			{ id: 3, groupId: -1, pinned: false } as chrome.tabs.Tab,
		]);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		expect(deps.mocks.getAllWindows).toHaveBeenCalledWith(true);
		expect(deps.mocks.moveTabs).toHaveBeenCalled();
	});

	it('retains pinned tabs after merging', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [{ id: 3, active: true }]),
			createMockChromeWindow(2, [{ id: 1 }, { id: 2, pinned: true }]),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);
		deps.mocks.queryTabs.mockResolvedValue([]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(2, { pinned: true });
	});

	it('preserves tab groups after merging', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [{ id: 3, active: true }]),
			createMockChromeWindow(2, [
				{ id: 1, groupId: 1 },
				{ id: 2, groupId: 1 },
			]),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);
		deps.mocks.queryTabs.mockResolvedValue([
			{ id: 1, groupId: 1, pinned: false } as chrome.tabs.Tab,
			{ id: 2, groupId: 1, pinned: false } as chrome.tabs.Tab,
			{ id: 3, groupId: -1, pinned: false } as chrome.tabs.Tab,
		]);

		await mergeWindows(false, deps);

		expect(deps.mocks.moveGroup).toHaveBeenCalledWith(1, expect.any(Object));
	});

	it('does nothing when only one window exists', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [createMockChromeWindow(1, [{ id: 1 }])];

		deps.mocks.getAllWindows.mockResolvedValue(windows);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBeNull();
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('does not mix normal and incognito windows', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [{ id: 1 }], { incognito: false }),
			createMockChromeWindow(2, [{ id: 2 }], { incognito: true }),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBeNull();
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('safely skips windows with no tabs', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, []),
			createMockChromeWindow(2, [{ id: 1 }]),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);

		const result = await mergeWindows(false, deps);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBeNull();
		}
		expect(deps.mocks.moveTabs).not.toHaveBeenCalled();
	});

	it('retains muted state after merging', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [{ id: 3, active: true }]),
			createMockChromeWindow(2, [
				{ id: 1, mutedInfo: { muted: true } },
				{ id: 2, mutedInfo: { muted: false } },
			]),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);
		deps.mocks.queryTabs.mockResolvedValue([]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(1, { muted: true });
		expect(deps.mocks.updateTab).not.toHaveBeenCalledWith(2, { muted: true });
	});

	it('prioritizes focused window as merge target', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [{ id: 1 }]),
			createMockChromeWindow(2, [{ id: 2, active: true }], { focused: true }),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);
		deps.mocks.queryTabs.mockResolvedValue([
			{ id: 1, groupId: -1, pinned: false } as chrome.tabs.Tab,
			{ id: 2, groupId: -1, pinned: false } as chrome.tabs.Tab,
		]);

		await mergeWindows(false, deps);

		// Verify that tabs from window 1 are moved to window 2 (focused window)
		// The first call should move ungrouped tabs from window 1 to window 2
		const firstCall = deps.mocks.moveTabs.mock.calls[0];
		expect(firstCall).toBeDefined();
		expect(firstCall[1].windowId).toBe(2);
	});

	it('restores focus to the active tab after merge', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [
				{ id: 1, active: true },
				{ id: 2, active: false },
			]),
			createMockChromeWindow(
				2,
				[
					{ id: 3, active: false },
					{ id: 4, active: false },
				],
				{ focused: true }
			),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);
		deps.mocks.queryTabs.mockResolvedValue([]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(1, { active: true });
	});

	it('preserves focus on focused window active tab', async () => {
		const deps = createMockMergeWindowsDeps();

		const windows: chrome.windows.Window[] = [
			createMockChromeWindow(1, [
				{ id: 1, active: true },
				{ id: 2, active: false },
			]),
			createMockChromeWindow(
				2,
				[
					{ id: 3, active: true },
					{ id: 4, active: false },
				],
				{ focused: true }
			),
		];

		deps.mocks.getAllWindows.mockResolvedValue(windows);
		deps.mocks.queryTabs.mockResolvedValue([]);

		await mergeWindows(false, deps);

		expect(deps.mocks.updateTab).toHaveBeenCalledWith(3, { active: true });
	});
});
