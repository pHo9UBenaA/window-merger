import { setTimeout as flush } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupContextMenus } from '../../src/adapters/chrome/context-menu';
import { mergeWindows } from '../../src/application/merge-windows';

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
			addListener: vi.fn<(fn: (info: { menuItemId: string | number }) => void) => void>(),
		},
	},
	action: { onClicked: { addListener: vi.fn<(fn: () => void) => void>() } },
};
const menu = (menuItemId: string | number) =>
	chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0]({ menuItemId });
const action = () => chromeMock.action.onClicked.addListener.mock.calls[0][0]();

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
	it('initializes once even when installation and startup follow worker load', async () => {
		chromeMock.runtime.onInstalled.addListener.mock.calls[0][0]();
		chromeMock.runtime.onStartup.addListener.mock.calls[0][0]();
		await flush();
		expect(setupMenus).toHaveBeenCalledOnce();
	});

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
		menu(id);
		await flush();
		expect(merge).toHaveBeenCalledExactlyOnceWith(incognito, expect.any(Object));
	});

	it.each(['unknown', 123])('ignores unknown menu ID %s', async (id) => {
		menu(id);
		await flush();
		expect(merge).not.toHaveBeenCalled();
	});

	it('merges normal and incognito windows from the action', async () => {
		action();
		await flush();
		expect(merge.mock.calls.map(([incognito]) => incognito)).toEqual([false, true]);
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

	it('logs synchronous exceptions and keeps the other mode independent', async () => {
		const error = new Error('Unexpected failure');
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		merge.mockImplementationOnce(() => {
			throw error;
		});
		action();
		await flush();
		expect(log).toHaveBeenCalledWith('Failed to merge windows:', error);
		expect(merge).toHaveBeenCalledTimes(2);
	});

	it('does not log successful merges', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		merge.mockResolvedValueOnce({
			ok: true,
			data: {
				targetWindowId: { kind: 'WindowId', value: 1 },
				activeTabId: { kind: 'TabId', value: 1 },
			},
		});
		action();
		await flush();
		expect(log).not.toHaveBeenCalled();
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
