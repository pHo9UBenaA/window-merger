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

test('preserves a collapsed group left alone in a source window @compat', async ({
	extension: { worker },
}) => {
	const before = await worker.evaluate(async () => {
		const source = await chrome.windows.create({
			url: ['about:blank', 'about:blank', 'about:blank'],
		});
		const ids = (source?.tabs ?? []).map((tab) => tab.id).filter((id) => id !== undefined);
		if (ids.length !== 3) throw new Error('Missing test tabs');
		const group = await chrome.tabs.group({ tabIds: [ids[1], ids[2]] });
		await chrome.tabGroups.update(group, { collapsed: true });
		const target = await chrome.windows.create({ url: 'about:blank' });
		if (target?.id === undefined) throw new Error('Missing target window');
		return { group, target: target.id };
	});
	await worker.evaluate(
		(target) => mergerTest.menuFromWindow('mergeWindowId', target),
		before.target
	);
	await expect
		.poll(() => worker.evaluate((group) => chrome.tabGroups.get(group), before.group))
		.toMatchObject({ collapsed: true, windowId: before.target });
	expect(await worker.evaluate(() => mergerTest.errors)).toEqual([]);
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
	expect(after.toSorted((a, b) => (a.id ?? 0) - (b.id ?? 0))).toEqual(
		before.toSorted((a, b) => (a.id ?? 0) - (b.id ?? 0))
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
		const tabs = source?.tabs ?? [];
		const ids = tabs.map((tab) => tab.id).filter((id) => id !== undefined);
		const pinned = ids.slice(0, 5);
		const muted = ids.slice(0, 10);
		for (const id of pinned) await chrome.tabs.update(id, { pinned: true });
		for (const id of muted) await chrome.tabs.update(id, { muted: true });
		const groups: number[] = [];
		for (let index = 10; index < ids.length; index += 10) {
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
	expect(after.ids.toSorted()).toEqual(before.ids.toSorted());
	expect(after.groups.toSorted()).toEqual(before.groups.toSorted());
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
