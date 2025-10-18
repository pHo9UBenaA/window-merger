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

	it('preserves autoDiscardable settings after merging', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 3, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false, autoDiscardable: false }, // User disabled auto-discard
			{ id: 2, windowId: 2, pinned: false, autoDiscardable: true },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.tabs.update).toHaveBeenCalledWith(1, { autoDiscardable: false });
		expect(chrome.tabs.update).toHaveBeenCalledWith(2, { autoDiscardable: true });
	});

	it('handles tabs without autoDiscardable property', async () => {
		// Arrange
		const mockTabs1: Partial<ChromeTab>[] = [{ id: 3, windowId: 1, pinned: false }];
		const mockTabs2: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false }, // No autoDiscardable property
			{ id: 2, windowId: 2, pinned: false, autoDiscardable: true },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito, tabs: mockTabs1 as ChromeTab[] },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs2 as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		// Should only update tab 2, not tab 1 (which has no autoDiscardable property)
		expect(chrome.tabs.update).toHaveBeenCalledWith(2, { autoDiscardable: true });
		const updateMock = chrome.tabs.update as unknown as {
			mock: { calls: Array<[number, { autoDiscardable?: boolean }]> };
		};
		const autoDiscardCalls = updateMock.mock.calls.filter(
			(call) => call[0] === 1 && 'autoDiscardable' in call[1]
		);
		expect(autoDiscardCalls).toHaveLength(0);
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
