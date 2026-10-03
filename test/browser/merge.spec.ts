import type { Worker } from '@playwright/test';
import { expect, test } from './fixtures';

const expectMenus = async (worker: Worker, incognito: boolean, operation?: 'create' | 'update') => {
	await expect
		.poll(() =>
			worker.evaluate(
				(operation) =>
					mergerTest.menuOperations
						.filter((entry) => operation === undefined || entry.operation === operation)
						.map(({ id, enabled }) => ({ id, enabled })),
				operation
			)
		)
		.toEqual(
			expect.arrayContaining([
				{ id: 'mergeWindowId', enabled: true },
				{ id: 'mergeIncognitoWindowId', enabled: incognito },
			])
		);
};

test('loads the packaged manifest, tooltip, shortcut and padded store icon', async ({
	extension: { worker },
}) => {
	const actual = await worker.evaluate(async () => {
		const manifest = chrome.runtime.getManifest();
		const iconPath = manifest.icons?.['128'];
		if (typeof iconPath !== 'string') throw new Error('Missing 128px icon');
		const image = await createImageBitmap(
			await (await fetch(chrome.runtime.getURL(iconPath))).blob()
		);
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Missing image context');
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, image.width, image.height).data;
		const opaquePixels = Array.from(
			{ length: image.width * image.height },
			(_, index) => index
		).filter((index) => pixels[index * 4 + 3] !== 0);
		const opaqueMarginPixels = opaquePixels.filter((pixelIndex) => {
			const x = pixelIndex % image.width;
			const y = Math.floor(pixelIndex / image.width);
			return x < 16 || y < 16 || x >= 112 || y >= 112;
		}).length;
		const opaqueArtworkPixels = opaquePixels.length - opaqueMarginPixels;
		return {
			manifest,
			iconSize: [image.width, image.height],
			opaqueMarginPixels,
			opaqueArtworkPixels,
			title: await chrome.action.getTitle({}),
			description: chrome.i18n.getMessage('extensionDescription'),
			commands: await chrome.commands.getAll(),
			errors: mergerTest.errors,
		};
	});
	expect(actual.manifest.background).toMatchObject({ type: 'module' });
	expect(actual.manifest.action?.default_icon).toHaveProperty('24', 'icon-24.png');
	expect(actual.iconSize).toEqual([128, 128]);
	expect(actual.opaqueMarginPixels).toBe(0);
	expect(actual.opaqueArtworkPixels).toBeGreaterThan(0);
	expect(actual.description).not.toBe('');
	expect(actual.title).toBe(actual.description);
	expect(actual.commands.map(({ name }) => name)).toContain('_execute_action');
	expect(actual.errors).toEqual([]);
});

test('merges real windows while preserving IDs, groups, pinned and muted states', async ({
	extension: { worker },
}) => {
	const before = await worker.evaluate(async () => {
		const source = await chrome.windows.create({
			url: ['about:blank', 'about:blank', 'about:blank', 'about:blank'],
		});
		if (!source?.tabs?.length) throw new Error('Missing test tabs');
		const ids = source.tabs.map((tab) => {
			if (tab.id === undefined) throw new Error('Missing test tab ID');
			return tab.id;
		});
		await chrome.tabs.update(ids[0], { pinned: true });
		await chrome.tabs.update(ids[1], { muted: true });
		const group = await chrome.tabs.group({ tabIds: [ids[2], ids[3]] });
		await chrome.tabGroups.update(group, {
			title: 'Test group',
			color: 'blue',
			collapsed: true,
		});
		const popup = await chrome.windows.create({ type: 'popup', url: 'about:blank' });
		if (popup?.id === undefined || !popup.tabs?.length) throw new Error('Missing test popup');
		await chrome.windows.create({ url: 'about:blank', focused: true });
		const all = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
		// Headless Chromium may report no focused window. Follow the documented tie-breaker.
		const target =
			all.find((window) => window.focused) ??
			all.toSorted((a, b) => (a.id ?? 0) - (b.id ?? 0))[0];
		const active = target?.tabs?.find((tab) => tab.active)?.id;
		if (active === undefined) throw new Error('Missing active target tab');
		return {
			ids,
			group,
			popupId: popup.id,
			popupTabIds: popup.tabs.map((tab) => tab.id),
			target: target?.id,
			active,
			allIds: all.flatMap((window) => window.tabs?.map((tab) => tab.id) ?? []),
		};
	});
	await worker.evaluate(async () => {
		await mergerTest.action();
		mergerTest.menu('mergeWindowId'); // Duplicates must not start another merge.
		mergerTest.menu('mergeIncognitoWindowId'); // Unavailable mode must be harmless.
	});
	await expect
		.poll(() =>
			worker.evaluate(
				async () => (await chrome.windows.getAll({ windowTypes: ['normal'] })).length
			)
		)
		.toBe(1);
	await expect
		.poll(() =>
			worker.evaluate(async ({ ids, active }) => {
				const [pinned, muted, selected] = await Promise.all([
					chrome.tabs.get(ids[0]),
					chrome.tabs.get(ids[1]),
					chrome.tabs.get(active),
				]);
				return [pinned.pinned, muted.mutedInfo?.muted, selected.active];
			}, before)
		)
		.toEqual([true, true, true]);
	const after = await worker.evaluate(
		async ({ group, popupId }) => ({
			windows: await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
			group: await chrome.tabGroups.get(group),
			popup: await chrome.windows.get(popupId, { populate: true }),
			errors: mergerTest.errors,
		}),
		before
	);
	expect(after.windows[0].id).toBe(before.target);
	expect(after.windows[0].tabs?.map((tab) => tab.id).sort()).toEqual(before.allIds.sort());
	expect(after.group).toMatchObject({
		title: 'Test group',
		color: 'blue',
		collapsed: true,
		windowId: before.target,
	});
	expect(after.popup).toMatchObject({ id: before.popupId, type: 'popup' });
	expect(after.popup.tabs?.map((tab) => tab.id)).toEqual(before.popupTabIds);
	expect(after.errors).toEqual([]);
});

test('respects incognito permission changes and never mixes normal and incognito tabs', async ({
	extension: { worker: initial, restart, restartWorker },
}) => {
	await expectMenus(initial, false, 'create');
	const worker = await restart(true);
	await expectMenus(worker, true);
	await restartWorker(worker);
	await expectMenus(worker, true, 'update');
	expect(await worker.evaluate(() => chrome.extension.isAllowedIncognitoAccess())).toBe(true);
	const before = await worker.evaluate(async () => {
		await chrome.windows.create({ incognito: true, url: ['about:blank', 'about:blank'] });
		await chrome.windows.create({ incognito: true, url: 'about:blank' });
		await chrome.windows.create({ url: 'about:blank' });
		return (await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })).flatMap(
			(window) => (window.tabs ?? []).map((tab) => ({ id: tab.id, incognito: tab.incognito }))
		);
	});
	await worker.evaluate(() => mergerTest.action());
	await expect
		.poll(() =>
			worker.evaluate(async () => {
				const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
				return [
					windows.filter((window) => !window.incognito).length,
					windows.filter((window) => window.incognito).length,
				];
			})
		)
		.toEqual([1, 1]);
	const after = await worker.evaluate(async () =>
		(await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })).flatMap(
			(window) => (window.tabs ?? []).map((tab) => ({ id: tab.id, incognito: tab.incognito }))
		)
	);
	expect(after.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))).toEqual(
		before.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
	);
	expect(await worker.evaluate(() => mergerTest.errors)).toEqual([]);
	const denied = await restart(false);
	await expectMenus(denied, false);
	expect(await denied.evaluate(() => chrome.extension.isAllowedIncognitoAccess())).toBe(false);
	expect(await denied.evaluate(() => mergerTest.errors)).toEqual([]);
});

test('merges a larger snapshot without losing tabs @stress', async ({
	extension: { worker },
}, testInfo) => {
	const count = Number(process.env.STRESS_TABS ?? 200);
	if (!Number.isInteger(count) || count < 2 || count > 2000)
		throw new Error('STRESS_TABS must be 2..2000');
	const before = await worker.evaluate(async (count) => {
		const source = await chrome.windows.create({
			url: Array.from({ length: count }, () => 'about:blank'),
		});
		if (source?.tabs?.length !== count) throw new Error('Missing stress test tabs');
		const ids = source.tabs.map((tab) => {
			if (tab.id === undefined) throw new Error('Missing stress test tab ID');
			return tab.id;
		});
		const pinned = ids.slice(0, 5);
		const muted = ids.slice(0, 10);
		for (const id of pinned) await chrome.tabs.update(id, { pinned: true });
		for (const id of muted) await chrome.tabs.update(id, { muted: true });
		const groups: number[] = [];
		for (const [index] of ids.entries()) {
			if (index < 10 || index % 10 !== 0) continue;
			groups.push(
				await chrome.tabs.group({
					tabIds: [ids[index], ...ids.slice(index + 1, index + 10)],
				})
			);
		}
		const all = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
		return {
			ids: all.flatMap((window) => window.tabs?.map((tab) => tab.id) ?? []),
			pinned,
			muted,
			groups,
		};
	}, count);
	const start = Date.now();
	await worker.evaluate(() => mergerTest.action());
	await expect
		.poll(
			() =>
				worker.evaluate(
					async () => (await chrome.windows.getAll({ windowTypes: ['normal'] })).length
				),
			{ timeout: 120000 }
		)
		.toBe(1);
	await expect
		.poll(() =>
			worker.evaluate(async ({ pinned, muted }) => {
				const tabs = await chrome.tabs.query({ windowType: 'normal' });
				return (
					pinned.every((id) => tabs.some((tab) => tab.id === id && tab.pinned)) &&
					muted.every((id) => tabs.some((tab) => tab.id === id && tab.mutedInfo?.muted))
				);
			}, before)
		)
		.toBe(true);
	const after = await worker.evaluate(async () => ({
		ids: (await chrome.tabs.query({ windowType: 'normal' })).map((tab) => tab.id),
		groups: (await chrome.tabGroups.query({})).map((group) => group.id),
		errors: mergerTest.errors,
	}));
	expect(after.ids.sort()).toEqual(before.ids.sort());
	expect(after.groups.sort()).toEqual(before.groups.sort());
	expect(after.errors).toEqual([]);
	await testInfo.attach('merge-duration', {
		body: JSON.stringify({
			tabs: before.ids.length,
			groups: before.groups.length,
			milliseconds: Date.now() - start,
		}),
		contentType: 'application/json',
	});
});
