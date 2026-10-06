import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, test as base, chromium, expect, type Worker } from '@playwright/test';
import { build } from 'esbuild';
import { PROJECT_ROOT } from '../../scripts/build';

// chrome.developerPrivate exists only on chrome://extensions pages and is absent from @types/chrome.
declare global {
	namespace chrome {
		namespace developerPrivate {
			function updateProfileConfiguration(
				properties: { inDeveloperMode: boolean },
				callback: () => void
			): void;
			function updateExtensionConfiguration(
				properties: { extensionId: string; incognitoAccess: boolean },
				callback: () => void
			): void;
			function getExtensionsInfo(
				query: { includeDisabled: boolean; includeTerminated: boolean },
				callback: (info: { id: string; state: string }[]) => void
			): void;
		}
	}
}

// Playwright serializes these into the chrome://extensions page, so they must not
// reference module scope. lastError is only valid inside the management callbacks.

// Modern Chrome disables unpacked extensions on reload without Developer mode.
const enableDeveloperMode = () =>
	new Promise<void>((resolve, reject) => {
		chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, () => {
			const error = chrome.runtime.lastError;
			if (error) reject(new Error(error.message));
			else resolve();
		});
	});

const applyIncognitoAccess = ({
	extensionId,
	incognitoAccess,
}: {
	extensionId: string;
	incognitoAccess: boolean;
}) =>
	new Promise<void>((resolve, reject) => {
		chrome.developerPrivate.updateExtensionConfiguration(
			{ extensionId, incognitoAccess },
			() => {
				const error = chrome.runtime.lastError;
				if (error) reject(new Error(error.message));
				else resolve();
			}
		);
	});

const readExtensionState = (extensionId: string) =>
	new Promise<string | undefined>((resolve, reject) => {
		chrome.developerPrivate.getExtensionsInfo(
			{ includeDisabled: true, includeTerminated: true },
			(info) => {
				const error = chrome.runtime.lastError;
				if (error) reject(new Error(error.message));
				else resolve(info.find((extension) => extension.id === extensionId)?.state);
			}
		);
	});

const grantIncognitoAccess = async (
	context: BrowserContext,
	extensionId: string,
	incognitoAccess: boolean
): Promise<void> => {
	const page = await context.newPage();
	await page.goto('chrome://extensions');
	await page.evaluate(enableDeveloperMode);
	await page.evaluate(applyIncognitoAccess, { extensionId, incognitoAccess });
	// The update callback precedes reload completion; the caller closes the context to finish it.
	await expect.poll(() => page.evaluate(readExtensionState, extensionId)).toBe('ENABLED');
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
		// Set by `pnpm chrome:install` to test a locked Chrome for Testing build.
		const executablePath = process.env.CHROME_EXECUTABLE_PATH;
		const expectedMajor = process.env.CHROME_MAJOR;
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
					...(executablePath ? { executablePath } : { channel: 'chromium' }),
					headless: process.env.HEADED !== '1',
					args: [
						`--disable-extensions-except=${extension}`,
						`--load-extension=${extension}`,
					],
				});
				const page = context.pages()[0] ?? (await context.newPage());
				const session = await context.newCDPSession(page);
				try {
					if (expectedMajor) {
						const version = await session.send('Browser.getVersion');
						const major = version.product.split('/')[1]?.split('.')[0];
						if (major !== expectedMajor)
							throw new Error(
								`Expected Chrome ${expectedMajor}, launched ${version.product}`
							);
					}
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
					session.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
						const activated = versions.find(
							(version) => version.scriptURL === worker.url()
						);
						if (activated?.status === 'activated')
							runningStatus = activated.runningStatus;
					});
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
					const workerURL = new URL(worker.url());
					// Use Chrome's management-page API, only in this test's temporary profile.
					if (incognito !== undefined && context)
						await grantIncognitoAccess(context, workerURL.host, incognito);
					await context?.close();
					return launch(new URL('/', workerURL).href);
				},
			});
		} finally {
			await context?.close();
			await rm(directory, { recursive: true, force: true });
		}
	},
});
export { expect } from '@playwright/test';
