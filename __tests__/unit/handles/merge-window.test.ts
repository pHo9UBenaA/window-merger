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
	it('複数のウィンドウがマージされること', async () => {
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

	it('ピン留めされたがマージ後も保持されていること', async () => {
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

	it('タブグループがマージ後も保持されていること', async () => {
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

	it('ウィンドウが1つしかない場合は何もしないこと', async () => {
		// Arrange
		const mockWindows: Partial<ChromeWindow>[] = [{ id: 1, type: 'normal', incognito }];
		chrome.windows.getAll.mockResolvedValue(mockWindows as ChromeWindow[]);

		// Act
		await handlerFunction();

		// Assert
		expect(chrome.windows.getAll).toHaveBeenCalled();
		expect(chrome.tabs.move).not.toHaveBeenCalled();
	});

	it('通常ウィンドウとシークレットウィンドウをマージしないこと', async () => {
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

	it('エラーが発生した際コンソールにエラー内容が出力されること', async () => {
		// Arrange
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		chrome.windows.getAll.mockRejectedValue(new Error('Test error'));

		// Act
		await handlerFunction();

		// Assert
		expect(consoleSpy).toHaveBeenCalledWith(
			'Failed to process:',
			expect.any(Error) // エラーオブジェクトが渡されていることを確認
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
