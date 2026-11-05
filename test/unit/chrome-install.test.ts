import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChrome } from '../../scripts/chrome-install/main';
import { applyLockUpdate } from '../../scripts/chrome-update/main';
import { prepareLockUpdate } from '../../scripts/chrome-update/read';
import { useOperationRoot } from '../helpers/script-operations';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawnSync: vi.fn() }));
vi.mock('../../scripts/lib/run-node', async () => ({
	runNode: (await import('../helpers/script-operations')).runScript,
}));
const exec = vi.mocked(execFileSync);
const version = '120.0.6099.109';
const nextVersion = '121.0.6167.184';
const platform = 'linux64';
const content = Buffer.alloc(200000, 42);
const sha256 = createHash('sha256').update(content).digest('hex');
const allPlatforms = { linux64: sha256, win64: sha256, 'mac-arm64': sha256 };
let checksums: Record<string, Record<string, unknown>>;
let availablePlatforms: string[];
let root: string;
let downloads: string[];
const checksumPath = () => join(root, 'test/browser/chrome-checksums.json');
const lockPath = () => join(root, 'test/browser/chrome-versions.json');
const saveChecksums = () => writeFile(checksumPath(), JSON.stringify(checksums));

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'window-merger-chrome-test-'));
	await mkdir(join(root, 'src/assets'), { recursive: true });
	await mkdir(join(root, 'test/browser'), { recursive: true });
	await writeFile(join(root, 'src/assets/manifest.json'), '{"minimum_chrome_version":"120"}');
	await writeFile(lockPath(), JSON.stringify({ '120': version }));
	checksums = { [version]: { ...allPlatforms } };
	await saveChecksums();
	availablePlatforms = Object.keys(allPlatforms);
	downloads = [];
	useOperationRoot(root);
	vi.stubEnv('RUNNER_TEMP', root);
	vi.stubEnv('GITHUB_ENV', join(root, 'github-env'));
	vi.spyOn(console, 'log').mockImplementation(() => {});
	exec.mockReturnValue(Buffer.alloc(0));
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, options?: RequestInit) => {
			if (url.startsWith('https://storage.googleapis.com/')) {
				expect(options?.redirect).toBe('error');
				downloads.push(url);
				return new Response(content);
			}
			const reports: Record<string, unknown> = {
				'latest-versions-per-milestone.json': {
					milestones: { '120': { version }, '121': { version: nextVersion } },
				},
				'last-known-good-versions.json': { channels: { Stable: { version: nextVersion } } },
				'known-good-versions-with-downloads.json': {
					versions: [version, nextVersion].map((value) => ({
						version: value,
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
	vi.unstubAllGlobals();
	await rm(root, { recursive: true, force: true });
});

const installDirectories = async () =>
	(await readdir(root)).filter((name) => name.startsWith('window-merger-chrome-install-'));

describe('Chrome installer', () => {
	it('hashes the entire download before extracting and publishing the executable path', async () => {
		await installChrome('120', platform);
		expect(downloads).toEqual([
			`https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chrome-${platform}.zip`,
		]);
		expect(exec).toHaveBeenCalledExactlyOnceWith(
			'unzip',
			expect.arrayContaining(['-q', '-d']),
			expect.any(Object)
		);
		const [directory] = await installDirectories();
		expect(await readFile(join(root, 'github-env'), 'utf8')).toContain(
			join(root, directory, 'chrome-linux64/chrome')
		);
		await expect(readFile(join(root, directory, 'chrome.zip'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
		expect(JSON.parse(await readFile(checksumPath(), 'utf8'))).toEqual(checksums);
	});

	it('rejects a missing checksum before downloading', async () => {
		delete checksums[version][platform];
		await saveChecksums();
		await expect(installChrome('120', platform)).rejects.toThrow(
			'Missing or invalid Chrome SHA-256'
		);
		expect(downloads).toEqual([]);
		expect(exec).not.toHaveBeenCalled();
	});

	it('rejects modified archives without extracting or publishing paths', async () => {
		checksums[version][platform] = '0'.repeat(64);
		await saveChecksums();
		await expect(installChrome('120', platform)).rejects.toThrow('SHA-256 mismatch');
		expect(exec).not.toHaveBeenCalled();
		expect(await installDirectories()).toEqual([]);
		await expect(readFile(join(root, 'github-env'))).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('cleans up failed extraction without publishing paths', async () => {
		exec.mockImplementation(() => {
			throw new Error('Extraction failed');
		});
		await expect(installChrome('120', platform)).rejects.toThrow('Extraction failed');
		expect(await installDirectories()).toEqual([]);
		await expect(readFile(join(root, 'github-env'))).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('rejects unsupported platforms and unlocked majors', async () => {
		await expect(installChrome('120', '../../other')).rejects.toThrow('Unsupported');
		await expect(installChrome('121', platform)).rejects.toThrow('not locked');
		expect(downloads).toEqual([]);
	});
});

const updateLock = async (): Promise<void> => applyLockUpdate(await prepareLockUpdate());
const hashDirectories = async () =>
	(await readdir(root)).filter((name) => name.startsWith('.window-merger-chrome-hash-'));

describe('Chrome lock update', () => {
	it('rejects incomplete platform metadata without updating locks', async () => {
		availablePlatforms = availablePlatforms.filter((platform) => platform !== 'mac-arm64');
		await expect(updateLock()).rejects.toThrow('for mac-arm64; lock unchanged');
		expect(downloads).toEqual([]);
		expect(JSON.parse(await readFile(lockPath(), 'utf8'))).toEqual({ '120': version });
	});

	it('fills missing checksums without replacing existing pins or extracting archives', async () => {
		checksums[nextVersion] = { linux64: 'b'.repeat(64) };
		await saveChecksums();
		await updateLock();
		expect(downloads).toHaveLength(2);
		expect(downloads).toEqual(
			expect.arrayContaining([
				`https://storage.googleapis.com/chrome-for-testing-public/${nextVersion}/win64/chrome-win64.zip`,
				`https://storage.googleapis.com/chrome-for-testing-public/${nextVersion}/mac-arm64/chrome-mac-arm64.zip`,
			])
		);
		expect(exec).not.toHaveBeenCalled();
		expect(await hashDirectories()).toEqual([]);
		expect(JSON.parse(await readFile(checksumPath(), 'utf8'))).toEqual({
			...checksums,
			[nextVersion]: { ...allPlatforms, linux64: 'b'.repeat(64) },
		});
		expect(JSON.parse(await readFile(lockPath(), 'utf8'))).toEqual({
			'120': version,
			'121': nextVersion,
		});
	});

	it('rejects invalid existing checksums rather than replacing them', async () => {
		checksums[version][platform] = 'invalid';
		await saveChecksums();
		await expect(updateLock()).rejects.toThrow('Missing or invalid');
		expect(downloads).toEqual([]);
	});

	it('removes temporary output and leaves both locks unchanged when a later download stream fails', async () => {
		const plan = await prepareLockUpdate();
		vi.mocked(fetch)
			.mockResolvedValueOnce(new Response(content))
			.mockResolvedValueOnce(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(content);
							controller.error(new Error('Stream failed'));
						},
					})
				)
			);
		await expect(applyLockUpdate(plan)).rejects.toThrow('Stream failed');
		expect(await hashDirectories()).toEqual([]);
		expect(JSON.parse(await readFile(lockPath(), 'utf8'))).toEqual({ '120': version });
		expect(JSON.parse(await readFile(checksumPath(), 'utf8'))).toEqual(checksums);
	});
});
