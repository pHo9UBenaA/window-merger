import { setTimeout as flush } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupContextMenus } from '../../src/adapters/chrome/context-menu';
import { mergeWindows } from '../../src/application/merge-windows';
import { createMockChromeTab } from '../factories/chrome';
import { createTestWindowId } from '../factories/domain';

vi.mock('../../src/application/merge-windows', () => ({ mergeWindows: vi.fn() }));
vi.mock('../../src/adapters/chrome/context-menu', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/adapters/chrome/context-menu')>()),
	setupContextMenus: vi.fn(),
}));

const merge = vi.mocked(mergeWindows);
const setupMenus = vi.mocked(setupContextMenus);
const noMerge = {
	ok: false,
	error: {
		type: 'insufficient-windows',
		message: 'Not enough windows',
		context: { windowCount: 1 },
	},
} as const;
const chromeMock = {
	runtime: {
		onInstalled: { addListener: vi.fn<(fn: () => void) => void>() },
		onStartup: { addListener: vi.fn<(fn: () => void) => void>() },
	},
	contextMenus: {
		onClicked: {
			addListener:
				vi.fn<
					(
						fn: (info: { menuItemId: string | number }, tab?: chrome.tabs.Tab) => void
					) => void
				>(),
		},
	},
	action: { onClicked: { addListener: vi.fn<(fn: (tab: chrome.tabs.Tab) => void) => void>() } },
};
const menu = (menuItemId: string | number, tab?: chrome.tabs.Tab) =>
	chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0]({ menuItemId }, tab);
const action = (tab = createMockChromeTab(1)) =>
	chromeMock.action.onClicked.addListener.mock.calls[0][0](tab);

const loadBackground = async () => {
	vi.resetModules();
	chromeMock.runtime.onInstalled.addListener.mockClear();
	chromeMock.runtime.onStartup.addListener.mockClear();
	chromeMock.contextMenus.onClicked.addListener.mockClear();
	chromeMock.action.onClicked.addListener.mockClear();
	await import('../../src/background');
};

beforeEach(async () => {
	vi.stubGlobal('chrome', chromeMock);
	merge.mockResolvedValue(noMerge);
	setupMenus.mockResolvedValue();
	await loadBackground();
});
afterEach(() => vi.restoreAllMocks());

describe('background events', () => {
	it('does not overlap pending initialization or repeat a successful setup', async () => {
		const pending = Promise.withResolvers<void>();
		setupMenus.mockReturnValueOnce(pending.promise);
		await loadBackground();
		const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];
		installed();
		chromeMock.runtime.onStartup.addListener.mock.calls[0][0]();
		expect(setupMenus).toHaveBeenCalledTimes(2);
		pending.resolve();
		await flush();
		installed();
		await flush();
		expect(setupMenus).toHaveBeenCalledTimes(2);
	});

	it.each([
		['mergeWindowId', false],
		['mergeIncognitoWindowId', true],
	] as const)('routes %s', async (id, incognito) => {
		menu(id, createMockChromeTab(1, { windowId: 42 }));
		await flush();
		expect(merge).toHaveBeenCalledExactlyOnceWith(
			incognito,
			expect.any(Object),
			createTestWindowId(42)
		);
	});

	it('passes window ID zero to both action modes', async () => {
		action(createMockChromeTab(1, { windowId: 0 }));
		await flush();
		expect(merge.mock.calls.map(([incognito, , target]) => ({ incognito, target }))).toEqual([
			{ incognito: false, target: createTestWindowId(0) },
			{ incognito: true, target: createTestWindowId(0) },
		]);
	});

	it('ignores duplicates across entry points until the same mode finishes', async () => {
		const pending = Promise.withResolvers<typeof noMerge>();
		merge.mockImplementation(async (incognito) => (incognito ? noMerge : pending.promise));
		menu('mergeWindowId');
		action();
		menu('mergeWindowId');
		expect(merge.mock.calls.map(([incognito]) => incognito)).toEqual([false, true]);
		pending.resolve(noMerge);
		await flush();
		merge.mockResolvedValue(noMerge);
		menu('mergeWindowId');
		await flush();
		expect(merge).toHaveBeenCalledTimes(3);
	});

	it('logs rejected operations and releases the guard for retry', async () => {
		const error = new AggregateError([new Error('Move failed')], 'Merge failed');
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		merge.mockRejectedValueOnce(error);
		menu('mergeWindowId');
		await flush();
		expect(log).toHaveBeenCalledExactlyOnceWith('Failed to merge windows:', error);
		menu('mergeWindowId');
		await flush();
		expect(merge).toHaveBeenCalledTimes(2);
	});

	it('logs planning failures but not insufficient windows', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = {
			type: 'no-active-tab',
			message: 'No active tab',
			context: { windowCount: 2 },
		} as const;
		merge.mockResolvedValueOnce({ ok: false, error });
		menu('mergeWindowId');
		await flush();
		menu('mergeWindowId');
		await flush();
		expect(log).toHaveBeenCalledExactlyOnceWith('Failed to merge windows:', error);
	});

	it('logs a menu failure and retries on the next lifecycle event', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = new Error('Menu failed');
		setupMenus.mockRejectedValueOnce(error);
		await loadBackground();
		await flush();
		expect(log).toHaveBeenCalledExactlyOnceWith('Failed to set up context menus:', error);
		chromeMock.runtime.onInstalled.addListener.mock.calls[0][0]();
		await flush();
		expect(setupMenus).toHaveBeenCalledTimes(3);
		chromeMock.runtime.onStartup.addListener.mock.calls[0][0]();
		await flush();
		expect(setupMenus).toHaveBeenCalledTimes(3);
	});
});
