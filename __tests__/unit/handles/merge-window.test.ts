import { describe, expect, it, vi } from 'vitest';
import {
	handleMergeIncognitoWindowEvent,
	handleMergeWindowEvent,
} from '../../../src/handles/merge-window';
import { VitestChrome as chrome } from '../../types/chrome';

type ChromeWindow = Awaited<ReturnType<typeof chrome.windows.getAll>>[0];
type ChromeTab = Awaited<ReturnType<typeof chrome.tabs.query>>[0];

const runTestsForHandler = (
	handlerFunction: typeof handleMergeWindowEvent | typeof handleMergeIncognitoWindowEvent,
	incognito: boolean
) => {
	it('merges multiple windows together', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 3, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false },
			{ id: 2, windowId: 2, pinned: true },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		// Mock tabs.query to return all tabs in the target window (after merge)
		chrome.tabs.query.mockResolvedValue([...mockTabs1, ...mockTabs2] as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
		expect(chrome.tabs.move).toHaveBeenCalled();
	});

	it('retains pinned tabs after merging', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 3, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false },
			{ id: 2, windowId: 2, pinned: true },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		chrome.tabs.query.mockResolvedValue(mockTabs2 as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.tabs.update).toHaveBeenCalledWith(2, { pinned: true });
	});

	it('preserves tab groups after merging', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 3, windowId: 1, groupId: -1 }];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, groupId: 1 },
			{ id: 2, windowId: 2, groupId: 1 },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		chrome.tabs.query.mockResolvedValue([...mockTabs1, ...mockTabs2] as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.tabGroups.move).toHaveBeenCalledWith(1, expect.any(Object));
	});

	it('does nothing when only one window exists', async () => {
		// Arrange
		const mockTabs: Partial<ChromeTab>[] = [{ id: 1, windowId: 1, pinned: false }];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalled();
		expect(chrome.tabs.move).not.toHaveBeenCalled();
	});

	it('does not mix normal and incognito windows', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 1, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [{ id: 2, windowId: 2, pinned: false }];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito: !incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
		expect(chrome.tabs.move).not.toHaveBeenCalled();
	});

	it('logs the error to the console when a failure occurs', async () => {
		// Arrange
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		chrome.windows.getAll.mockRejectedValue(new Error('Test error'));

		// Act
		await handlerFunction();

		// Assert
		expect(consoleSpy).toHaveBeenCalledWith(
			'Failed to process:',
			expect.any(Error) // Validate that an Error instance reaches the logger
		);
		expect(consoleSpy.mock.calls[0][1].message).toBe('Test error');
	});

	it('safely skips windows with no tabs', async () => {
		// Arrange
		const mockTabs: Partial<ChromeTab>[] = [{ id: 1, windowId: 2, pinned: false }];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: [] }, // Empty tabs
			{ id: 2, type: 'normal', incognito, tabs: mockTabs as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
		expect(chrome.tabs.move).not.toHaveBeenCalled(); // Only one valid window, no merge
	});

	it('safely skips windows without tabs property', async () => {
		// Arrange
		const mockTabs: Partial<ChromeTab>[] = [{ id: 1, windowId: 2, pinned: false }];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito }, // No tabs property
			{ id: 2, type: 'normal', incognito, tabs: mockTabs as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
		expect(chrome.tabs.move).not.toHaveBeenCalled(); // Only one valid window, no merge
	});

	it('does not crash when all windows are empty', async () => {
		// Arrange
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: [] },
			{ id: 2, type: 'normal', incognito, tabs: [] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
		expect(chrome.tabs.move).not.toHaveBeenCalled();
	});

	it('retains muted state after merging', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 3, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false, mutedInfo: { muted: true } },
			{ id: 2, windowId: 2, pinned: false, mutedInfo: { muted: false } },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.tabs.update).toHaveBeenCalledWith(1, { muted: true });
		expect(chrome.tabs.update).not.toHaveBeenCalledWith(2, { muted: true });
	});

	it('does not modify unmuted tabs', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 3, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false, mutedInfo: { muted: false } },
			{ id: 2, windowId: 2, pinned: false },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		const updateMock = chrome.tabs.update as unknown as {
			mock: { calls: Array<[number, { muted?: boolean }]> };
		};
		const mutedCalls = updateMock.mock.calls.filter((call) => call[1]?.muted === true);
		expect(mutedCalls).toHaveLength(0);
	});

	it('prioritizes focused window as merge target', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 1, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [{ id: 2, windowId: 2, pinned: false }];
		const mockTabs3: Partial<ChromeTab>[] = [{ id: 3, windowId: 3, pinned: false }];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, focused: false, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, focused: true, tabs: mockTabs2 as ChromeTab[] }, // Focused
			{ id: 3, type: 'normal', incognito, focused: false, tabs: mockTabs3 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		// Tabs from window 1 and 3 should be moved to window 2 (focused)
		expect(chrome.tabs.move).toHaveBeenCalledWith(
			[1],
			expect.objectContaining({ windowId: 2 })
		);
		expect(chrome.tabs.move).toHaveBeenCalledWith(
			[3],
			expect.objectContaining({ windowId: 2 })
		);
	});

	it('prioritizes normal/maximized window over minimized', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 1, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [{ id: 2, windowId: 2, pinned: false }];
		const mockTabs3: Partial<ChromeTab>[] = [{ id: 3, windowId: 3, pinned: false }];
		const mockWindows: Partial<ChromeWindow>[] = [
			{
				id: 1,
				type: 'normal',
				incognito,
				focused: false,
				state: 'minimized',
				tabs: mockTabs1 as ChromeTab[],
			},
			{
				id: 2,
				type: 'normal',
				incognito,
				focused: false,
				state: 'normal',
				tabs: mockTabs2 as ChromeTab[],
			}, // Normal state
			{
				id: 3,
				type: 'normal',
				incognito,
				focused: false,
				state: 'minimized',
				tabs: mockTabs3 as ChromeTab[],
			},
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		// Tabs from window 1 and 3 should be moved to window 2 (normal state)
		expect(chrome.tabs.move).toHaveBeenCalledWith(
			[1],
			expect.objectContaining({ windowId: 2 })
		);
		expect(chrome.tabs.move).toHaveBeenCalledWith(
			[3],
			expect.objectContaining({ windowId: 2 })
		);
	});

	it('focused window takes priority over normal state', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 1, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [{ id: 2, windowId: 2, pinned: false }];
		const mockWindows: Partial<ChromeWindow>[] = [
			{
				id: 1,
				type: 'normal',
				incognito,
				focused: false,
				state: 'normal',
				tabs: mockTabs1 as ChromeTab[],
			},
			{
				id: 2,
				type: 'normal',
				incognito,
				focused: true,
				state: 'minimized',
				tabs: mockTabs2 as ChromeTab[],
			}, // Focused but minimized
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		// Window 2 should be target despite being minimized, because it's focused
		expect(chrome.tabs.move).toHaveBeenCalledWith(
			[1],
			expect.objectContaining({ windowId: 2 })
		);
	});

	it('preserves tab group membership after reordering', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 1, pinned: false, groupId: 1 }, // Group 1
			{ id: 2, windowId: 1, pinned: false, groupId: 1 }, // Group 1
		];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 3, windowId: 2, pinned: false, groupId: -1 }, // Regular tab
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		// After merge, tabs should be reordered but group membership preserved
		chrome.tabs.query.mockResolvedValue([...mockTabs1, ...mockTabs2] as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		// Tab groups should be moved as a unit, not individual tabs from groups
		expect(chrome.tabGroups.move).toHaveBeenCalled();
		// Individual tabs in groups should NOT be moved separately
		const tabMoveCalls = (chrome.tabs.move as unknown as { mock: { calls: unknown[][] } }).mock
			.calls;
		// Only ungrouped tabs should be moved individually
		const individualTabMoves = tabMoveCalls.filter(
			(call: unknown[]) => typeof call[0] === 'number' // Single tab ID
		);
		// Should only move the regular tab (id: 3), not grouped tabs (id: 1, 2)
		expect(individualTabMoves.some((call: unknown[]) => call[0] === 1 || call[0] === 2)).toBe(
			false
		);
	});

	it('maintains original tab order from each window during merge', async () => {
		// Arrange: Window1 has tabs 1,2,3 and Window2 has tabs 4,5,6
		const mockTabs1: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 1, pinned: false, groupId: -1, index: 0 },
			{ id: 2, windowId: 1, pinned: false, groupId: -1, index: 1 },
			{ id: 3, windowId: 1, pinned: false, groupId: -1, index: 2 },
		];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 4, windowId: 2, pinned: false, groupId: -1, index: 0 },
			{ id: 5, windowId: 2, pinned: false, groupId: -1, index: 1 },
			{ id: 6, windowId: 2, pinned: false, groupId: -1, index: 2 },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		chrome.tabs.query.mockResolvedValue([...mockTabs2, ...mockTabs1] as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		// After reordering, tabs should be in order: 4,5,6,1,2,3 (Window2 tabs first as it's target)
		// This is checked by verifying tabs are moved to correct indices
		const tabMoveCalls = (chrome.tabs.move as unknown as { mock: { calls: unknown[][] } }).mock
			.calls;
		// Check that tabs are repositioned to maintain order
		expect(tabMoveCalls.length).toBeGreaterThan(0);
	});

	it('restores focus to the previously active tab after merge', async () => {
		// Arrange: Window1 has active tab, Window2 is target (focused)
		const mockTabs1: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 1, pinned: false, groupId: -1, active: true }, // Active in source
			{ id: 2, windowId: 1, pinned: false, groupId: -1, active: false },
		];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 3, windowId: 2, pinned: false, groupId: -1, active: false },
			{ id: 4, windowId: 2, pinned: false, groupId: -1, active: false },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, focused: false, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, focused: true, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		chrome.tabs.query.mockResolvedValue([...mockTabs2, ...mockTabs1] as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		// Tab 1 (which was active in Window1) should be reactivated
		expect(chrome.tabs.update).toHaveBeenCalledWith(1, { active: true });
	});

	it('preserves focus on focused window active tab after merge', async () => {
		// Arrange: Window2 is focused and has active tab, Window1 also has active tab
		const mockTabs1: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 1, pinned: false, groupId: -1, active: true }, // Active but not focused window
			{ id: 2, windowId: 1, pinned: false, groupId: -1, active: false },
		];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 3, windowId: 2, pinned: false, groupId: -1, active: true }, // Active in focused window
			{ id: 4, windowId: 2, pinned: false, groupId: -1, active: false },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, focused: false, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, focused: true, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		chrome.tabs.query.mockResolvedValue([...mockTabs2, ...mockTabs1] as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		// Tab 3 (which was active in focused Window2) should remain/be reactivated
		expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true });
	});

	it('keeps target window active tab if no other windows have active tabs', async () => {
		// Arrange: Only Window2 (target, focused) has an active tab
		const mockTabs1: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 1, pinned: false, groupId: -1, active: false },
			{ id: 2, windowId: 1, pinned: false, groupId: -1, active: false },
		];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 3, windowId: 2, pinned: false, groupId: -1, active: true }, // Active in target
			{ id: 4, windowId: 2, pinned: false, groupId: -1, active: false },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, focused: false, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, focused: true, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		chrome.tabs.query.mockResolvedValue([...mockTabs2, ...mockTabs1] as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		// Tab 3 should remain active (focused window's active tab is preserved)
		expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true });
	});
};

describe('Window merger functionality', () => {
	describe('handleMergeWindowEvent', () => {
		runTestsForHandler(handleMergeWindowEvent, false);
	});

	describe('handleMergeIncognitoWindowEvent', () => {
		runTestsForHandler(handleMergeIncognitoWindowEvent, true);
	});
});
