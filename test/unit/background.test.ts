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
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
	vi.resetModules();
	vi.stubGlobal('chrome', chromeMock);
	merge.mockResolvedValue(noMerge);
	setupMenus.mockResolvedValue();
	await import('../../src/background');
});
afterEach(() => vi.restoreAllMocks());

describe('background events', () => {
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
		let finish!: (value: typeof noMerge) => void;
		merge.mockImplementation((incognito) =>
			incognito
				? Promise.resolve(noMerge)
				: new Promise((resolve) => {
						finish = resolve;
					})
		);
		menu('mergeWindowId');
		action();
		menu('mergeWindowId');
		expect(merge.mock.calls.map(([incognito]) => incognito)).toEqual([false, true]);
		finish(noMerge);
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

	it('initializes menus on installation and logs setup failure', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = new Error('Menu failed');
		setupMenus.mockRejectedValueOnce(error);
		chromeMock.runtime.onInstalled.addListener.mock.calls[0][0]();
		await flush();
		expect(log).toHaveBeenCalledWith('Failed to set up context menus:', error);
	});
});
