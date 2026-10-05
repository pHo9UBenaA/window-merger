import { expect, test } from './fixtures';

for (const incognito of [false, true]) {
	for (const trigger of ['action', 'menu'] as const) {
		for (const targetIndex of [0, 1]) {
			test(`preserves exact strip order: ${targetIndex + 1} first, ${trigger}, incognito=${incognito} @compat`, async ({
				extension: { restart },
			}, testInfo) => {
				const worker = await restart(true);
				const before = await worker.evaluate(async (incognito) => {
					const original = await chrome.windows.getAll();
					const first = await chrome.windows.create({
						incognito,
						url: Array.from({ length: 10 }, () => 'about:blank'),
					});
					const second = await chrome.windows.create({
						incognito,
						url: Array.from({ length: 7 }, () => 'about:blank'),
					});
					const other = await chrome.windows.create({
						incognito: !incognito,
						url: 'about:blank',
					});
					const popup = await chrome.windows.create({
						type: 'popup',
						incognito,
						url: 'about:blank',
					});
					if (
						first?.id === undefined ||
						second?.id === undefined ||
						other?.id === undefined ||
						popup?.id === undefined
					)
						throw new Error('Missing fixture windows');
					for (const window of original)
						if (window.id !== undefined) await chrome.windows.remove(window.id);
					const groups: chrome.tabGroups.TabGroup[] = [];
					for (const [window, memberRuns] of [
						[
							first,
							[
								[3, 4],
								[7, 8],
							],
						],
						[second, [[4, 5]]],
					] as const) {
						const ids = window.tabs?.map((tab) => tab.id as number);
						if (!ids?.length) throw new Error('Missing fixture tabs');
						for (const id of ids.slice(0, 2))
							await chrome.tabs.update(id, { pinned: true });
						await chrome.tabs.update(ids[2], { active: true, muted: true });
						for (const members of memberRuns) {
							const id = await chrome.tabs.group({
								tabIds: [ids[members[0]], ids[members[1]]],
								createProperties: { windowId: window.id },
							});
							await chrome.tabGroups.update(id, {
								title: `Group ${groups.length}`,
								color: groups.length === 0 ? 'blue' : 'red',
								collapsed: groups.length !== 1,
							});
							groups.push(await chrome.tabGroups.get(id));
							await chrome.tabs.update(ids[members[0]], { muted: true });
						}
					}
					return {
						extensionVersion: chrome.runtime.getManifest().version,
						windows: await Promise.all(
							[first.id, second.id].map((id) =>
								chrome.windows.get(id, { populate: true })
							)
						),
						groups,
						other: await chrome.windows.get(other.id, { populate: true }),
						popup: await chrome.windows.get(popup.id, { populate: true }),
					};
				}, incognito);
				await testInfo.attach('ordering-before', {
					body: JSON.stringify(before),
					contentType: 'application/json',
				});
				const target = before.windows[targetIndex];
				const source = before.windows[1 - targetIndex];
				const ordered = [...(target.tabs ?? []), ...(source.tabs ?? [])];
				const pinned = ordered.filter((tab) => tab.pinned).map((tab) => tab.id);
				const unpinned = ordered.filter((tab) => !tab.pinned).map((tab) => tab.id);
				const active = target.tabs?.find((tab) => tab.active)?.id;
				await worker.evaluate(
					async ({ trigger, windowId, incognito }) => {
						if (trigger === 'action') await mergerTest.actionFromWindow(windowId);
						else
							await mergerTest.menuFromWindow(
								incognito ? 'mergeIncognitoWindowId' : 'mergeWindowId',
								windowId
							);
					},
					{ trigger, windowId: target.id as number, incognito }
				);

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
							{ incognito, active }
						)
					)
					.toEqual({ pinned, active: true });

				const after = await worker.evaluate(
					async ({ target, other, popup }) => ({
						window: await chrome.windows.get(target.id as number, { populate: true }),
						groups: await chrome.tabGroups.query({ windowId: target.id }),
						other: await chrome.windows.get(other.id as number, { populate: true }),
						popup: await chrome.windows.get(popup.id as number, { populate: true }),
						errors: mergerTest.errors,
					}),
					{ target, other: before.other, popup: before.popup }
				);
				await testInfo.attach('ordering-snapshot', {
					body: JSON.stringify({ before, after }),
					contentType: 'application/json',
				});
				const tabs = after.window.tabs ?? [];
				expect(tabs.map((tab) => tab.id)).toEqual([...pinned, ...unpinned]);
				expect(tabs.filter((tab) => tab.pinned).map((tab) => tab.id)).toEqual(pinned);
				expect(tabs.filter((tab) => !tab.pinned).map((tab) => tab.id)).toEqual(unpinned);
				expect(new Set(tabs.map((tab) => tab.id)).size).toBe(ordered.length);
				expect(tabs.find((tab) => tab.active)?.id).toBe(active);
				for (const original of ordered) {
					expect(tabs.find((tab) => tab.id === original.id)).toMatchObject({
						pinned: original.pinned,
						groupId: original.groupId,
						incognito: original.incognito,
						mutedInfo: { muted: original.mutedInfo?.muted },
					});
				}
				expect(after.groups).toHaveLength(before.groups.length);
				for (const group of before.groups) {
					expect(after.groups.find(({ id }) => id === group.id)).toEqual({
						...group,
						windowId: target.id,
					});
					const members = tabs.filter((tab) => tab.groupId === group.id);
					expect(members.map((tab) => tab.id)).toEqual(
						ordered.filter((tab) => tab.groupId === group.id).map((tab) => tab.id)
					);
					expect(members.map((tab) => tab.index)).toEqual(
						members.map((_, index) => members[0].index + index)
					);
				}
				expect(after.other.tabs?.map((tab) => tab.id)).toEqual(
					before.other.tabs?.map((tab) => tab.id)
				);
				expect(after.popup.tabs?.map((tab) => tab.id)).toEqual(
					before.popup.tabs?.map((tab) => tab.id)
				);
				expect(after.errors).toEqual([]);
			});
		}
	}
}
