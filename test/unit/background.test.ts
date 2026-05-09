import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeWindows } from '../../src/application/merge-windows';

vi.mock('../../src/application/merge-windows', () => ({
	mergeWindows: vi.fn(),
}));

const mockedMergeWindows = vi.mocked(mergeWindows);

const createBackgroundChromeMock = () => {
	const clickedFns: ((info: chrome.contextMenus.OnClickData) => void)[] = [];

	return {
		runtime: {
			onInstalled: { addListener: vi.fn() },
		},
		contextMenus: {
			create: vi.fn(),
			removeAll: vi.fn(),
			update: vi.fn(),
			onClicked: {
				addListener: vi.fn((fn: (info: chrome.contextMenus.OnClickData) => void) => {
					clickedFns.push(fn);
				}),
			},
		},
		action: {
			onClicked: { addListener: vi.fn() },
		},
		extension: {
			isAllowedIncognitoAccess: vi.fn().mockResolvedValue(false),
		},
		i18n: {
			getMessage: vi.fn((key: string) => key),
		},
		tabs: { move: vi.fn(), update: vi.fn() },
		tabGroups: { move: vi.fn() },
		windows: { getAll: vi.fn() },
		triggerClicked: (menuItemId: string) => {
			for (const fn of clickedFns) {
				fn({ menuItemId, editable: false, pageUrl: '' });
			}
		},
	};
};

let chromeMock: ReturnType<typeof createBackgroundChromeMock>;

beforeAll(async () => {
	chromeMock = createBackgroundChromeMock();
	vi.stubGlobal('chrome', chromeMock);
	await import('../../src/background');
});

beforeEach(() => {
	vi.stubGlobal('chrome', chromeMock);
});

describe('background: context menu click handler', () => {
	it('calls the matching handler when a valid menu ID is clicked', async () => {
		mockedMergeWindows.mockResolvedValue({
			ok: false,
			error: {
				type: 'insufficient-windows',
				message: 'Not enough windows to merge',
				context: { windowCount: 1 },
			},
		});

		chromeMock.triggerClicked('mergeWindowId');

		await vi.waitFor(() => {
			expect(mockedMergeWindows).toHaveBeenCalledOnce();
		});
	});

	it('ignores clicks with an unrecognized menu ID', async () => {
		chromeMock.triggerClicked('unknownMenuId');

		await vi.waitFor(() => {
			expect(mockedMergeWindows).not.toHaveBeenCalled();
		});
	});
});

describe('background: merge handler error handling', () => {
	it('logs an error when the error type is not insufficient-windows', async () => {
		mockedMergeWindows.mockResolvedValue({
			ok: false,
			error: {
				type: 'no-active-tab',
				message: 'No active tab',
				context: { windowCount: 2 },
			},
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		chromeMock.triggerClicked('mergeWindowId');

		await vi.waitFor(() => {
			expect(consoleSpy).toHaveBeenCalledOnce();
		});
		consoleSpy.mockRestore();
	});

	it('does not log an error when the error type is insufficient-windows', async () => {
		mockedMergeWindows.mockResolvedValue({
			ok: false,
			error: {
				type: 'insufficient-windows',
				message: 'Not enough windows to merge',
				context: { windowCount: 1 },
			},
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		chromeMock.triggerClicked('mergeWindowId');

		await vi.waitFor(() => {
			expect(mockedMergeWindows).toHaveBeenCalledOnce();
		});
		expect(consoleSpy).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});
