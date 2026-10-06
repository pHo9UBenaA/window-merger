import type { Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type Trigger = 'action' | 'menu';

const CASES = [false, true].flatMap((incognito) =>
	(['action', 'menu'] as const).flatMap((trigger) =>
		[0, 1].map((targetIndex) => ({ incognito, trigger, targetIndex }))
	)
);

// Two mergeable windows whose strips are ordered against tab ID and creation order.
const createFixture = async (worker: Worker, incognito: boolean) => {
	return worker.evaluate(async (incognito) => {
		const original = await chrome.windows.getAll();
		const first = await chrome.windows.create({
			incognito,
			url: Array.from({ length: 10 }, () => 'about:blank'),
		});
		const second = await chrome.windows.create({
			incognito,
			url: Array.from({ length: 7 }, () => 'about:blank'),
		});
		const other = await chrome.windows.create({ incognito: !incognito, url: 'about:blank' });
		const popup = await chrome.windows.create({ type: 'popup', incognito, url: 'about:blank' });
		if (
			first?.id === undefined ||
			second?.id === undefined ||
			other?.id === undefined ||
			popup?.id === undefined
		)
			throw new Error('Missing fixture windows');
		for (const window of original)
			if (window.id !== undefined) await chrome.windows.remove(window.id);

		// Strip order must differ from ID/creation order, including multi-tab runs.
		// `groups` is shared across windows so group titles, colors and collapsed state keep
		// following the creation order of the whole fixture.
		const arrangeStrip = async (
			window: chrome.windows.Window,
			memberRuns: readonly (readonly [number, number])[],
			groups: chrome.tabGroups.TabGroup[]
		) => {
			const strip = (window.tabs ?? [])
				.map((tab) => tab.id)
				.filter((id) => id !== undefined)
				.toReversed();
			if (strip.length === 0) throw new Error('Missing fixture tabs');
			for (const id of strip) await chrome.tabs.move(id, { index: -1 });
			for (const id of strip.slice(0, 2)) await chrome.tabs.update(id, { pinned: true });
			await chrome.tabs.update(strip[2], { active: true, muted: true });
			for (const [firstIndex, secondIndex] of memberRuns) {
				const groupId = await chrome.tabs.group({
					tabIds: [strip[firstIndex], strip[secondIndex]],
					createProperties: { windowId: window.id },
				});
				await chrome.tabGroups.update(groupId, {
					title: `Group ${groups.length}`,
					color: groups.length === 0 ? 'blue' : 'red',
					collapsed: groups.length !== 1,
				});
				groups.push(await chrome.tabGroups.get(groupId));
				await chrome.tabs.update(strip[firstIndex], { muted: true });
			}
		};

		const groups: chrome.tabGroups.TabGroup[] = [];
		await arrangeStrip(
			first,
			[
				[3, 4],
				[7, 8],
			],
			groups
		);
		await arrangeStrip(second, [[4, 5]], groups);
		return {
			extensionVersion: chrome.runtime.getManifest().version,
			windows: await Promise.all(
				[first.id, second.id].map((id) => chrome.windows.get(id, { populate: true }))
			),
			groups,
			other: await chrome.windows.get(other.id, { populate: true }),
			popup: await chrome.windows.get(popup.id, { populate: true }),
		};
	}, incognito);
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

// The merge target's strip must survive verbatim, so read what must not change beforehand.
type Expectation = {
	targetId: number;
	ordered: readonly chrome.tabs.Tab[];
	pinned: readonly (number | undefined)[];
	unpinned: readonly (number | undefined)[];
	active: number | undefined;
};

const readExpectation = (fixture: Fixture, targetIndex: number): Expectation => {
	const target = fixture.windows[targetIndex];
	const source = fixture.windows[1 - targetIndex];
	const targetId = target.id;
	if (targetId === undefined) throw new Error('Missing fixture target window');
	const ordered = [...(target.tabs ?? []), ...(source.tabs ?? [])];
	return {
		targetId,
		ordered,
		pinned: ordered.filter((tab) => tab.pinned).map((tab) => tab.id),
		unpinned: ordered.filter((tab) => !tab.pinned).map((tab) => tab.id),
		active: target.tabs?.find((tab) => tab.active)?.id,
	};
};

const triggerMerge = async (
	worker: Worker,
	trigger: Trigger,
	targetId: number,
	incognito: boolean
) => {
	await worker.evaluate(
		async ({ trigger, targetId, incognito }) => {
			if (trigger === 'action') {
				await mergerTest.actionFromWindow(targetId);
				return;
			}
			await mergerTest.menuFromWindow(
				incognito ? 'mergeIncognitoWindowId' : 'mergeWindowId',
				targetId
			);
		},
		{ trigger, targetId, incognito }
	);
};

const waitForMergedWindows = async (worker: Worker, incognito: boolean) => {
	await expect
		.poll(() =>
			worker.evaluate(
				async (incognito) =>
					(await chrome.windows.getAll({ windowTypes: ['normal'] })).filter(
						(window) => window.incognito === incognito
					).length,
				incognito
			)
		)
		.toBe(1);
};

const waitForMergedStrip = async (worker: Worker, incognito: boolean, expected: Expectation) => {
	await expect
		.poll(() =>
			worker.evaluate(
				async ({ incognito, active }) => {
					const tabs = await chrome.tabs.query({ windowType: 'normal' });
					const merged = tabs.filter((tab) => tab.incognito === incognito);
					return {
						pinned: merged.filter((tab) => tab.pinned).map((tab) => tab.id),
						active: merged.find((tab) => tab.active)?.id === active,
					};
				},
				{ incognito, active: expected.active }
			)
		)
		.toEqual({ pinned: expected.pinned, active: true });
};

const readAfter = async (worker: Worker, fixture: Fixture, targetId: number) => {
	const otherId = fixture.other.id;
	const popupId = fixture.popup.id;
	if (otherId === undefined || popupId === undefined) throw new Error('Missing fixture windows');
	return worker.evaluate(
		async ({ targetId, otherId, popupId }) => ({
			window: await chrome.windows.get(targetId, { populate: true }),
			groups: await chrome.tabGroups.query({ windowId: targetId }),
			other: await chrome.windows.get(otherId, { populate: true }),
			popup: await chrome.windows.get(popupId, { populate: true }),
			errors: mergerTest.errors,
		}),
		{ targetId, otherId, popupId }
	);
};

type After = Awaited<ReturnType<typeof readAfter>>;

const expectPreserved = (fixture: Fixture, after: After, expected: Expectation) => {
	const tabs = after.window.tabs ?? [];
	expect(tabs.map((tab) => tab.id)).toEqual([...expected.pinned, ...expected.unpinned]);
	expect(tabs.filter((tab) => tab.pinned).map((tab) => tab.id)).toEqual(expected.pinned);
	expect(tabs.filter((tab) => !tab.pinned).map((tab) => tab.id)).toEqual(expected.unpinned);
	expect(new Set(tabs.map((tab) => tab.id)).size).toBe(expected.ordered.length);
	expect(tabs.find((tab) => tab.active)?.id).toBe(expected.active);
	for (const original of expected.ordered) {
		expect(tabs.find((tab) => tab.id === original.id)).toMatchObject({
			pinned: original.pinned,
			groupId: original.groupId,
			incognito: original.incognito,
			mutedInfo: { muted: original.mutedInfo?.muted },
		});
	}
	expect(after.groups).toHaveLength(fixture.groups.length);
	for (const group of fixture.groups) {
		expect(after.groups.find(({ id }) => id === group.id)).toEqual({
			...group,
			windowId: expected.targetId,
		});
		const members = tabs.filter((tab) => tab.groupId === group.id);
		expect(members.map((tab) => tab.id)).toEqual(
			expected.ordered.filter((tab) => tab.groupId === group.id).map((tab) => tab.id)
		);
		expect(members.map((tab) => tab.index)).toEqual(
			members.map((_, index) => members[0].index + index)
		);
	}
	expect(after.other.tabs?.map((tab) => tab.id)).toEqual(
		fixture.other.tabs?.map((tab) => tab.id)
	);
	expect(after.popup.tabs?.map((tab) => tab.id)).toEqual(
		fixture.popup.tabs?.map((tab) => tab.id)
	);
};

for (const { incognito, trigger, targetIndex } of CASES) {
	test(`preserves exact strip order: ${targetIndex + 1} first, ${trigger}, incognito=${incognito} @compat`, async ({
		extension: { restart },
	}, testInfo) => {
		const worker = await restart(true);
		const fixture = await createFixture(worker, incognito);
		await testInfo.attach('ordering-before', {
			body: JSON.stringify(fixture),
			contentType: 'application/json',
		});
		const expected = readExpectation(fixture, targetIndex);

		await triggerMerge(worker, trigger, expected.targetId, incognito);
		await waitForMergedWindows(worker, incognito);
		await waitForMergedStrip(worker, incognito, expected);

		const after = await readAfter(worker, fixture, expected.targetId);
		await testInfo.attach('ordering-snapshot', {
			body: JSON.stringify({ before: fixture, after }),
			contentType: 'application/json',
		});
		expectPreserved(fixture, after, expected);
		expect(after.errors).toEqual([]);
	});
}
