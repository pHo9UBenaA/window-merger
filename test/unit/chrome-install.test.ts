import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeExtractCommand } from '../../scripts/chrome-install/commands.generated';
import { installChrome } from '../../scripts/chrome-install/main';
import { applyLockUpdate } from '../../scripts/chrome-update/main';
import { prepareLockUpdate } from '../../scripts/lib/chrome-compat';
import { runNode } from '../../scripts/lib/run-node';

vi.mock('../../scripts/lib/run-node', () => ({ runNode: vi.fn() }));
const runSubprocess = (
	await vi.importActual<typeof import('../../scripts/lib/run-node')>('../../scripts/lib/run-node')
).runNode;
const version = '120.0.6099.109';
const nextVersion = '121.0.6167.184';
const platform = 'linux64';
const digest = (content: Buffer) => createHash('sha256').update(content).digest('hex');
let archive: Buffer<ArrayBuffer>;
let allPlatforms: Record<string, string>;
let downloadContent: Buffer;
let downloadFails: boolean;
let checksums: Record<string, Record<string, string>>;
let availablePlatforms: string[];
let root: string;
let downloads: string[];
const checksumPath = () => join(root, 'test/browser/chrome-checksums.json');
const lockPath = () => join(root, 'test/browser/chrome-versions.json');
const saveChecksums = () => writeFile(checksumPath(), JSON.stringify(checksums));

beforeAll(async () => {
	const directory = await mkdtemp(join(tmpdir(), 'window-merger-archive-'));
	try {
		await mkdir(join(directory, 'chrome-linux64'));
		await writeFile(join(directory, 'chrome-linux64/chrome'), 'fixture browser');
		execFileSync('zip', ['-q', 'archive.zip', 'chrome-linux64/chrome'], { cwd: directory });
		archive = await readFile(join(directory, 'archive.zip'));
		const sha256 = digest(archive);
		allPlatforms = { linux64: sha256, win64: sha256, 'mac-arm64': sha256 };
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-chrome-test-')));
	await mkdir(join(root, 'src/assets'), { recursive: true });
	await mkdir(join(root, 'test/browser'), { recursive: true });
	await writeFile(join(root, 'src/assets/manifest.json'), '{"minimum_chrome_version":"120"}');
	await writeFile(lockPath(), JSON.stringify({ '120': version }));
	checksums = { [version]: { ...allPlatforms } };
	await saveChecksums();
	availablePlatforms = Object.keys(allPlatforms);
	downloads = [];
	downloadContent = archive;
	downloadFails = false;
	vi.spyOn(process, 'cwd').mockReturnValue(root);
	vi.stubEnv('RUNNER_TEMP', root);
	vi.stubEnv('GITHUB_ENV', join(root, 'github-env'));
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.mocked(runNode).mockImplementation((command, input, cwd) => {
		const prelude = `globalThis.fetch = async () => new Response(new ReadableStream({
			start(controller) {
				const bytes = Buffer.from('${downloadContent.toString('base64')}', 'base64');
				const middle = Math.floor(bytes.length / 2);
				controller.enqueue(bytes.subarray(0, middle));
				if (${downloadFails}) controller.error(new Error('Stream failed'));
				else {
					controller.enqueue(bytes.subarray(middle));
					controller.close();
				}
			},
		}));`;
		return runSubprocess(
			[
				...command.slice(0, -1),
				`--import=data:text/javascript,${encodeURIComponent(prelude)}`,
				...command.slice(-1),
			],
			input,
			cwd
		);
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			if (url.startsWith('https://storage.googleapis.com/')) {
				downloads.push(url);
				return new Response(archive);
			}
			const reports: Record<string, unknown> = {
				'latest-versions-per-milestone.json': {
					milestones: { '120': { version }, '121': { version: nextVersion } },
				},
				'last-known-good-versions.json': { channels: { Stable: { version: nextVersion } } },
				'known-good-versions-with-downloads.json': {
					versions: [version, nextVersion].map((version) => ({
						version,
						downloads: { chrome: availablePlatforms.map((platform) => ({ platform })) },
					})),
				},
			};
			const report = reports[basename(url)];
			if (!report) throw new Error(`Unexpected URL ${url}`);
			return Response.json(report);
		})
	);
});
afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

const installDirectories = async () =>
	(await readdir(root)).filter((name) => name.startsWith('window-merger-chrome-install-'));
const updateLock = async () => applyLockUpdate(await prepareLockUpdate());
const expectLocksUnchanged = async () => {
	expect(JSON.parse(await readFile(lockPath(), 'utf8'))).toEqual({ '120': version });
	expect(JSON.parse(await readFile(checksumPath(), 'utf8'))).toEqual(checksums);
};

describe('Chrome installer', () => {
	it('verifies and extracts a streamed archive before publishing its executable', async () => {
		installChrome('120', platform);
		const [directory] = await installDirectories();
		const executable = join(root, directory, 'chrome-linux64/chrome');
		expect(await readFile(executable, 'utf8')).toBe('fixture browser');
		expect(await readFile(join(root, 'github-env'), 'utf8')).toContain(
			`CHROME_EXECUTABLE_PATH=${executable}`
		);
		await expect(readFile(join(root, directory, 'chrome.zip'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it.each(['checksum mismatch', 'interrupted download', 'invalid archive'])(
		'cleans up without publishing a path after %s',
		async (failure) => {
			if (failure === 'checksum mismatch') checksums[version][platform] = '0'.repeat(64);
			else if (failure === 'interrupted download') downloadFails = true;
			else {
				downloadContent = Buffer.from('not a ZIP archive');
				checksums[version][platform] = digest(downloadContent);
			}
			await saveChecksums();
			expect(() => installChrome('120', platform)).toThrow();
			expect(await installDirectories()).toEqual([]);
			await expect(readFile(join(root, 'github-env'))).rejects.toMatchObject({
				code: 'ENOENT',
			});
		}
	);

	it('rejects bytes changed after the download checksum was verified', async () => {
		const directory = await mkdtemp(join(root, 'window-merger-chrome-install-'));
		await writeFile(
			join(directory, 'chrome.zip'),
			Buffer.concat([archive, Buffer.from('changed')])
		);
		expect(() =>
			runNode(chromeExtractCommand(), { directory, major: '120', platform })
		).toThrow('Chrome SHA-256 mismatch; refusing to extract');
	});
});

describe('Chrome lock update', () => {
	it.each(['missing platform', 'invalid pin'])(
		'leaves locks unchanged for %s',
		async (failure) => {
			if (failure === 'missing platform') availablePlatforms = ['linux64', 'win64'];
			else checksums[version][platform] = 'invalid';
			await saveChecksums();
			await expect(updateLock()).rejects.toThrow();
			expect(downloads).toEqual([]);
			await expectLocksUnchanged();
		}
	);

	it('fills missing boundary checksums without replacing existing pins', async () => {
		checksums[nextVersion] = { linux64: 'b'.repeat(64) };
		await saveChecksums();
		await updateLock();
		expect(downloads).toEqual([
			`https://storage.googleapis.com/chrome-for-testing-public/${nextVersion}/win64/chrome-win64.zip`,
			`https://storage.googleapis.com/chrome-for-testing-public/${nextVersion}/mac-arm64/chrome-mac-arm64.zip`,
		]);
		expect(JSON.parse(await readFile(checksumPath(), 'utf8'))).toEqual({
			...checksums,
			[nextVersion]: { ...allPlatforms, linux64: 'b'.repeat(64) },
		});
		expect(JSON.parse(await readFile(lockPath(), 'utf8'))).toEqual({
			'120': version,
			'121': nextVersion,
		});
	});

	it('leaves both locks unchanged when a later download stream fails', async () => {
		const plan = await prepareLockUpdate();
		vi.mocked(fetch)
			.mockResolvedValueOnce(new Response(archive))
			.mockResolvedValueOnce(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new Error('Stream failed'));
						},
					})
				)
			);
		await expect(applyLockUpdate(plan)).rejects.toThrow('Stream failed');
		await expectLocksUnchanged();
	});
});
