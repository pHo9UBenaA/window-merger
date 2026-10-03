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
const createMenu = (properties: chrome.contextMenus.CreateProperties, done: () => void) => {
	const id = properties.id ?? '';
	if (menus.has(id)) {
		complete(done, 'Duplicate menu ID');
		return id;
	}
	menus.set(id, properties);
	complete(done);
	return id;
};
const create = vi.fn(createMenu);
const removeAll = vi.fn((done: () => void) => {
	queueMicrotask(() => {
		menus.clear();
		done();
	});
});
const allowed = vi.fn(async () => false);

beforeEach(() => {
	menus.clear();
	runtime.lastError = undefined;
	vi.stubGlobal('chrome', {
		runtime,
		contextMenus: { create, removeAll },
		extension: { isAllowedIncognitoAccess: allowed },
		i18n: { getMessage: (key: string) => key },
	});
});

describe('context menu lifecycle', () => {
	it('creates both menus using callback completion and initial permission state', async () => {
		await setupContextMenus();
		expect(menus.size).toBe(2);
		expect(menus.get(ContextMenuIds.mergeWindow)).toEqual({
			id: ContextMenuIds.mergeWindow,
			title: 'mergeWindowTitle',
			contexts: ['all'],
			enabled: true,
		});
		expect(menus.get(ContextMenuIds.mergeIncognitoWindow)).toEqual({
			id: ContextMenuIds.mergeIncognitoWindow,
			title: 'mergeIncognitoWindowTitle',
			contexts: ['all'],
			enabled: false,
		});
	});

	it('waits for removal to finish before creating menus', async () => {
		const removal = Promise.withResolvers<() => void>();
		removeAll.mockImplementationOnce((done) => removal.resolve(done));
		const setup = setupContextMenus();
		const done = await removal.promise;
		expect(create).not.toHaveBeenCalled();
		done();
		await setup;
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('waits for creation to finish before creating the next menu', async () => {
		const firstCreation = Promise.withResolvers<() => void>();
		create.mockImplementationOnce((properties, done) => {
			firstCreation.resolve(done);
			return properties.id ?? '';
		});
		const setup = setupContextMenus();
		const done = await firstCreation.promise;
		await Promise.resolve();
		expect(create).toHaveBeenCalledOnce();
		done();
		await setup;
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('recreates existing menus after permission changes without duplicating them', async () => {
		await setupContextMenus();
		allowed.mockResolvedValue(true);
		await setupContextMenus();
		expect(menus.get(ContextMenuIds.mergeIncognitoWindow)?.enabled).toBe(true);
		allowed.mockResolvedValue(false);
		await setupContextMenus();
		expect(menus.get(ContextMenuIds.mergeIncognitoWindow)?.enabled).toBe(false);
		expect(menus.size).toBe(2);
		expect(removeAll).toHaveBeenCalledTimes(3);
		expect(create).toHaveBeenCalledTimes(6);
	});

	it('rebuilds a partially initialized menu set and removes obsolete menus', async () => {
		menus.set(ContextMenuIds.mergeWindow, { id: ContextMenuIds.mergeWindow, title: 'Old' });
		menus.set('obsolete', { id: 'obsolete', title: 'Obsolete' });
		await setupContextMenus();
		expect(menus.size).toBe(2);
		expect(menus.has('obsolete')).toBe(false);
		expect(create).toHaveBeenCalledTimes(2);
		expect(menus.get(ContextMenuIds.mergeWindow)?.title).toBe('mergeWindowTitle');
	});

	it.each([ContextMenuIds.mergeWindow, ContextMenuIds.mergeIncognitoWindow])(
		'reports asynchronous creation failure for %s and allows retry',
		async (failedId) => {
			create.mockImplementation((properties, done) => {
				if (properties.id !== failedId) return createMenu(properties, done);
				complete(done, 'Creation failed');
				return properties.id;
			});
			await expect(setupContextMenus()).rejects.toThrow('Creation failed');
			expect(create).toHaveBeenCalledTimes(failedId === ContextMenuIds.mergeWindow ? 1 : 2);
			create.mockImplementation(createMenu);
			await setupContextMenus();
			expect(menus.size).toBe(2);
		}
	);

	it('propagates removal failure without creating menus', async () => {
		removeAll.mockImplementationOnce((done) => complete(done, 'Removal failed'));
		await expect(setupContextMenus()).rejects.toThrow('Removal failed');
		expect(create).not.toHaveBeenCalled();
	});

	it('propagates synchronous creation failure', async () => {
		const error = new Error('Create failed');
		create.mockImplementationOnce(() => {
			throw error;
		});
		await expect(setupContextMenus()).rejects.toBe(error);
		expect(create).toHaveBeenCalledOnce();
	});

	it('propagates permission query failure without removing existing menus', async () => {
		allowed.mockRejectedValueOnce(new Error('Permission query failed'));
		await expect(setupContextMenus()).rejects.toThrow('Permission query failed');
		expect(removeAll).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});
});
