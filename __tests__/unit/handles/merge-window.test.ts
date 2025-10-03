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
		const mockTabs: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false },
			{ id: 2, windowId: 2, pinned: true },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs as ChromeTab[] },
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
		const mockTabs: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, pinned: false },
			{ id: 2, windowId: 2, pinned: true },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);
		chrome.tabs.query.mockResolvedValue(mockTabs as ChromeTab[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.tabs.update).toHaveBeenCalledWith(2, { pinned: true });
	});

	it('preserves tab groups after merging', async () => {
		// Arrange
		const mockTabs: Partial<ChromeTab>[] = [
			{ id: 1, windowId: 2, groupId: 1 },
			{ id: 2, windowId: 2, groupId: 1 },
		];
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito },
			{ id: 2, type: 'normal', incognito, tabs: mockTabs as ChromeTab[] },
		];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.tabGroups.move).toHaveBeenCalledWith(1, expect.any(Object));
	});

	it('does nothing when only one window exists', async () => {
		// Arrange
		const mockWindows: Partial<ChromeWindow>[] = [{ id: 1, type: 'normal', incognito }];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalled();
		expect(chrome.tabs.move).not.toHaveBeenCalled();
	});

	it('does not mix normal and incognito windows', async () => {
		// Arrange
		const mockWindows: Partial<ChromeWindow>[] = [
			{ id: 1, type: 'normal', incognito },
			{ id: 2, type: 'normal', incognito: !incognito },
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
};

describe('Window merger functionality', () => {
	describe('handleMergeWindowEvent', () => {
		runTestsForHandler(handleMergeWindowEvent, false);
	});

	describe('handleMergeIncognitoWindowEvent', () => {
		runTestsForHandler(handleMergeIncognitoWindowEvent, true);
	});
});
