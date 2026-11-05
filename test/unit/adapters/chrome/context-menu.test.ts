import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenuIds, setupContextMenus } from '../../../../src/adapters/chrome/context-menu';

const menus = new Map<string, chrome.contextMenus.CreateProperties>();
const runtime: { lastError?: { message: string } } = {};
const complete = (done: () => void, message?: string) =>
	queueMicrotask(() => {
		runtime.lastError = message ? { message } : undefined;
		done();
		runtime.lastError = undefined;
	});
const create = vi.fn((properties: chrome.contextMenus.CreateProperties, done: () => void) => {
	const id = properties.id ?? '';
	menus.set(id, properties);
	complete(done);
	return id;
});
const update = vi.fn(
	(id: string, properties: chrome.contextMenus.CreateProperties, done: () => void) => {
		if (!menus.has(id)) {
			complete(done, 'Cannot find menu item');
			return;
		}
		menus.set(id, { ...menus.get(id), ...properties });
		complete(done);
	}
);
const allowed = vi.fn(async () => false);

beforeEach(() => {
	menus.clear();
	runtime.lastError = undefined;
	vi.stubGlobal('chrome', {
		runtime,
		contextMenus: { create, update },
		extension: { isAllowedIncognitoAccess: allowed },
		i18n: { getMessage: (key: string) => key },
	});
});

describe('context menu lifecycle', () => {
	it('creates both menus and updates them after permission changes without duplicates', async () => {
		await setupContextMenus();
		expect(menus.size).toBe(2);
		expect(menus.get(ContextMenuIds.mergeWindow)?.enabled).toBe(true);
		expect(menus.get(ContextMenuIds.mergeIncognitoWindow)?.enabled).toBe(false);
		allowed.mockResolvedValue(true);
		await setupContextMenus();
		expect(menus.get(ContextMenuIds.mergeIncognitoWindow)?.enabled).toBe(true);
		allowed.mockResolvedValue(false);
		await setupContextMenus();
		expect(menus.get(ContextMenuIds.mergeIncognitoWindow)?.enabled).toBe(false);
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('repairs a partially initialized menu set', async () => {
		menus.set(ContextMenuIds.mergeWindow, { id: ContextMenuIds.mergeWindow, title: 'Old' });
		await setupContextMenus();
		expect(create).toHaveBeenCalledOnce();
		expect(menus.get(ContextMenuIds.mergeWindow)?.title).toBe('mergeWindowTitle');
	});

	it('reports asynchronous creation failures', async () => {
		create.mockImplementation((properties, done) => {
			complete(done, 'Creation failed');
			return properties.id ?? '';
		});
		await expect(setupContextMenus()).rejects.toMatchObject({
			errors: [expect.any(Error), expect.objectContaining({ message: 'Creation failed' })],
		});
	});
});
