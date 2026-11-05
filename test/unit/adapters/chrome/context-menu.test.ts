import { expect, it, vi } from 'vitest';
import { setupContextMenus } from '../../../../src/adapters/chrome/context-menu';

it('reports asynchronous Chrome menu failures rather than completing initialization', async () => {
	const runtime: { lastError?: { message: string } } = {};
	const fail = (done: () => void) =>
		queueMicrotask(() => {
			runtime.lastError = { message: 'Menu operation failed' };
			done();
			runtime.lastError = undefined;
		});
	vi.stubGlobal('chrome', {
		runtime,
		contextMenus: {
			update: (_id: string, _properties: unknown, done: () => void) => fail(done),
			create: (_properties: unknown, done: () => void) => fail(done),
		},
		extension: { isAllowedIncognitoAccess: async () => false },
		i18n: { getMessage: (key: string) => key },
	});
	await expect(setupContextMenus()).rejects.toThrow('Failed to initialize menu');
});
