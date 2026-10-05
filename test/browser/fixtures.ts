import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, test as base, chromium, expect, type Worker } from '@playwright/test';
import { build } from 'esbuild';
import { PROJECT_ROOT } from '../../scripts/build';

type ChromeManagementApi = {
	updateProfileConfiguration: (
		properties: { inDeveloperMode: boolean },
		done: () => void
	) => void;
	updateExtensionConfiguration: (
		properties: { extensionId: string; incognitoAccess: boolean },
		done: () => void
	) => void;
	getExtensionsInfo: (
		properties: { includeDisabled: boolean; includeTerminated: boolean },
		done: (info: { id: string; state: string }[]) => void
	) => void;
};

export const test = base.extend<{
	extension: {
		worker: Worker;
		restart: (incognito?: boolean) => Promise<Worker>;
		restartWorker: (worker: Worker) => Promise<void>;
	};
}>({
	extension: async ({ browserName }, use) => {
		if (browserName !== 'chromium') throw new Error('Extension tests require Chromium');
		const directory = await mkdtemp(join(tmpdir(), 'window-merger-browser-'));
		const extension = join(directory, 'extension');
		let context: BrowserContext | undefined;
		try {
			// Exercise the actual release artifact, including compacted locales and manifest.
			execFileSync('unzip', ['-q', join(PROJECT_ROOT, 'dist.zip'), '-d', extension]);
			const harness = await build({
				entryPoints: [join(PROJECT_ROOT, 'test/browser/harness.ts')],
				bundle: true,
				write: false,
				format: 'iife',
				target: 'chrome120',
			});
			const background = join(extension, 'background.js');
			await writeFile(
				background,
				`${harness.outputFiles[0].text}\n${await readFile(background, 'utf8')}`
			);
			const launch = async (scopeURL?: string) => {
				context = await chromium.launchPersistentContext(join(directory, 'profile'), {
					channel: 'chromium',
					headless: process.env.HEADED !== '1',
					args: [
						`--disable-extensions-except=${extension}`,
						`--load-extension=${extension}`,
					],
				});
				const page = context.pages()[0] ?? (await context.newPage());
				const session = await context.newCDPSession(page);
				try {
					if (scopeURL) {
						// Chrome may leave a persisted extension worker idle after a profile restart.
						await session.send('ServiceWorker.enable');
						await session.send('ServiceWorker.startWorker', { scopeURL });
					}
					const worker =
						context.serviceWorkers()[0] ??
						(await context.waitForEvent('serviceworker', { timeout: 15000 }));
					// Hand out the worker only once production has created its context-menu entries.
					await expect
						.poll(
							() =>
								worker.evaluate(() =>
									typeof mergerTest === 'undefined'
										? 0
										: mergerTest.menuOperations.length
								),
							{ timeout: 15000 }
						)
						.toBeGreaterThan(0);
					return worker;
				} finally {
					await session.detach();
				}
			};
			const worker = await launch();
			await use({
				worker,
				restartWorker: async (worker) => {
					if (!context) throw new Error('Browser context is closed');
					const page = await context.newPage();
					const session = await context.newCDPSession(page);
					let runningStatus: string | undefined;
					session.on(
						'ServiceWorker.workerVersionUpdated',
						({
							versions,
						}: {
							versions: {
								scriptURL: string;
								status: string;
								runningStatus: string;
							}[];
						}) => {
							const version = versions.find(
								(version) => version.scriptURL === worker.url()
							);
							if (version?.status === 'activated')
								runningStatus = version.runningStatus;
						}
					);
					try {
						await session.send('ServiceWorker.enable');
						await expect.poll(() => runningStatus).toBe('running');
						// Keep the extension loaded and its menus intact; only restart its worker.
						await session.send('ServiceWorker.stopAllWorkers');
						await expect.poll(() => runningStatus).toBe('stopped');
						await session.send('ServiceWorker.startWorker', {
							scopeURL: new URL('/', worker.url()).href,
						});
						await expect.poll(() => runningStatus).toBe('running');
					} finally {
						await session.detach();
						await page.close();
					}
				},
				restart: async (incognito) => {
					if (incognito !== undefined && context) {
						// Use Chrome's management-page API, only in this test's temporary profile.
						const page = await context.newPage();
						await page.goto('chrome://extensions');
						// Modern Chrome disables unpacked extensions on reload without Developer mode.
						await page.evaluate(
							() =>
								new Promise<void>((resolve, reject) => {
									const api = Reflect.get(
										chrome,
										'developerPrivate'
									) as ChromeManagementApi;
									api.updateProfileConfiguration(
										{ inDeveloperMode: true },
										() => {
											if (chrome.runtime.lastError)
												reject(new Error(chrome.runtime.lastError.message));
											else resolve();
										}
									);
								})
						);
						await page.evaluate(
							({ extensionId, incognitoAccess }) =>
								new Promise<void>((resolve, reject) => {
									const api = Reflect.get(
										chrome,
										'developerPrivate'
									) as ChromeManagementApi;
									api.updateExtensionConfiguration(
										{ extensionId, incognitoAccess },
										() => {
											if (chrome.runtime.lastError)
												reject(new Error(chrome.runtime.lastError.message));
											else resolve();
										}
									);
								}),
							{ extensionId: new URL(worker.url()).host, incognitoAccess: incognito }
						);
						// The update callback precedes reload completion; closing now persists DISABLE_RELOAD.
						await expect
							.poll(() =>
								page.evaluate(
									(extensionId) =>
										new Promise<string | undefined>((resolve, reject) => {
											const api = Reflect.get(
												chrome,
												'developerPrivate'
											) as ChromeManagementApi;
											api.getExtensionsInfo(
												{ includeDisabled: true, includeTerminated: true },
												(info) => {
													if (chrome.runtime.lastError)
														reject(
															new Error(
																chrome.runtime.lastError.message
															)
														);
													else
														resolve(
															info.find(
																(extension) =>
																	extension.id === extensionId
															)?.state
														);
												}
											);
										}),
									new URL(worker.url()).host
								)
							)
							.toBe('ENABLED');
					}
					await context?.close();
					return launch(new URL('/', worker.url()).href);
				},
			});
		} finally {
			await context?.close();
			await rm(directory, { recursive: true, force: true });
		}
	},
});
export { expect } from '@playwright/test';
