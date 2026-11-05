import { setTimeout as flush } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
const menu = () =>
	chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0]({ menuItemId: 'mergeWindowId' });
const action = (tab = createMockChromeTab(1)) =>
	chromeMock.action.onClicked.addListener.mock.calls[0][0](tab);
const loadBackground = async () => {
	vi.resetModules();
	await import('../../src/background');
};
beforeEach(() => {
	vi.stubGlobal('chrome', chromeMock);
	merge.mockResolvedValue(noMerge);
	setupMenus.mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

it('retries failed initialization but does not overlap pending or repeat successful setup', async () => {
	const error = new Error('Menu failed');
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	setupMenus.mockRejectedValueOnce(error);
	await loadBackground();
	await flush();
	expect(log).toHaveBeenCalledWith(expect.any(String), error);
	const pending = Promise.withResolvers<void>();
	setupMenus.mockReturnValueOnce(pending.promise);
	const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];
	const startup = chromeMock.runtime.onStartup.addListener.mock.calls[0][0];
	installed();
	startup();
	expect(setupMenus).toHaveBeenCalledTimes(2);
	pending.resolve();
	await flush();
	installed();
	startup();
	expect(setupMenus).toHaveBeenCalledTimes(2);
});

it('passes window ID zero to both action modes', async () => {
	await loadBackground();
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
	await loadBackground();
	menu();
	action();
	menu();
	expect(merge.mock.calls.map(([incognito]) => incognito)).toEqual([false, true]);
	pending.resolve(noMerge);
	await flush();
	menu();
	await flush();
	expect(merge).toHaveBeenCalledTimes(3);
});

it('reports operational failures, permits retry and keeps insufficient windows quiet', async () => {
	const failure = new Error('Move failed');
	const planningFailure = {
		type: 'no-active-tab',
		message: 'No active tab',
		context: { windowCount: 2 },
	} as const;
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	merge
		.mockRejectedValueOnce(failure)
		.mockResolvedValueOnce({ ok: false, error: planningFailure });
	await loadBackground();
	for (let attempt = 0; attempt < 3; attempt++) {
		menu();
		await flush();
	}
	expect(log.mock.calls.map(([, error]) => error)).toEqual([failure, planningFailure]);
	expect(merge).toHaveBeenCalledTimes(3);
});
