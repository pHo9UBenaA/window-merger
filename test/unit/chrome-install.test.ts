import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChrome, updateLock } from '../../scripts/chrome-compat';

vi.mock('../../scripts/build', () => ({ PROJECT_ROOT: '/project' }));
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs/promises', async (original) => ({
	...(await original<typeof import('node:fs/promises')>()),
	appendFile: vi.fn(),
	mkdtemp: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
	rm: vi.fn((await original<typeof import('node:fs/promises')>()).rm),
}));
const exec = vi.mocked(execFileSync);
const version = '120.0.6099.109';
const nextVersion = '121.0.6167.184';
const platform = 'linux64';
const checksumPath = join('/project', 'test/browser/chrome-checksums.json');
const lockPath = join('/project', 'test/browser/chrome-versions.json');
const content = Buffer.alloc(200000, 42);
const sha256 = createHash('sha256').update(content).digest('hex');
const allPlatforms = { linux64: sha256, win64: sha256, 'mac-arm64': sha256 };
let checksums: Record<string, Record<string, unknown>>;
let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'window-merger-chrome-test-'));
	checksums = { [version]: { ...allPlatforms } };
	vi.stubEnv('GITHUB_ENV', '/github-env');
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.mocked(mkdtemp).mockImplementation(async (prefix) =>
		mkdtempSync(join(root, basename(String(prefix))))
	);
	vi.mocked(readFile).mockImplementation(async (path) => {
		if (String(path).endsWith('manifest.json'))
			return JSON.stringify({ minimum_chrome_version: '120' });
		if (String(path).endsWith('chrome-versions.json'))
			return JSON.stringify({ '120': version });
		if (String(path).endsWith('chrome-checksums.json')) return JSON.stringify(checksums);
		throw new Error(`Unexpected file ${path}`);
	});
	exec.mockImplementation((command, args) => {
		if (command === 'curl' && args) {
			const output = args[args.indexOf('--output') + 1];
			writeFileSync(output, content);
		}
		return Buffer.alloc(0);
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			const reports = {
				'latest-versions-per-milestone.json': {
					milestones: { '120': { version }, '121': { version: nextVersion } },
				},
				'last-known-good-versions.json': { channels: { Stable: { version: nextVersion } } },
				'known-good-versions-with-downloads.json': {
					versions: [version, nextVersion].map((value) => ({
						version: value,
						downloads: {
							chrome: Object.keys(allPlatforms).map((platform) => ({ platform })),
						},
					})),
				},
			};
			const report = reports[basename(url) as keyof typeof reports];
			if (!report) throw new Error(`Unexpected URL ${url}`);
			return new Response(JSON.stringify(report));
		})
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	rmSync(root, { recursive: true, force: true });
});

describe('Chrome installer', () => {
	it('hashes the whole archive before extraction and publishing executable paths', async () => {
		await installChrome('120', platform);
		expect(exec.mock.calls.map(([command]) => command)).toEqual(['curl', 'unzip']);
		expect(exec).toHaveBeenNthCalledWith(
			1,
			'curl',
			expect.arrayContaining([
				'--proto',
				'=https',
				'--proto-redir',
				'=https',
				`https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chrome-${platform}.zip`,
			]),
			expect.any(Object)
		);
		expect(appendFile).toHaveBeenCalledWith(
			'/github-env',
			expect.stringContaining('CHROME_EXECUTABLE_PATH=')
		);
		expect(writeFile).not.toHaveBeenCalled();
		expect(rm).toHaveBeenCalledWith(expect.stringContaining('chrome.zip'), { force: true });
		expect(rm).not.toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
	});

	it.each([
		undefined,
		null,
		'',
		'0'.repeat(63),
		'0'.repeat(65),
		'g'.repeat(64),
		`${'0'.repeat(64)}\n`,
	])('rejects an absent or invalid checksum before downloading: %j', async (checksum) => {
		checksums[version][platform] = checksum;
		await expect(installChrome('120', platform)).rejects.toThrow(
			'Missing or invalid Chrome SHA-256'
		);
		expect(mkdtemp).not.toHaveBeenCalled();
		expect(exec).not.toHaveBeenCalled();
		expect(appendFile).not.toHaveBeenCalled();
	});

	it('rejects an unregistered version without downloading', async () => {
		checksums = {};
		await expect(installChrome('120', platform)).rejects.toThrow('Missing or invalid');
		expect(exec).not.toHaveBeenCalled();
	});

	it('rejects modified archives without extraction, publishing paths or rewriting checksums', async () => {
		checksums[version][platform] = '0'.repeat(64);
		await expect(installChrome('120', platform)).rejects.toThrow('SHA-256 mismatch');
		expect(exec.mock.calls.map(([command]) => command)).toEqual(['curl']);
		expect(rm).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
		expect(appendFile).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
	});

	it('cleans up after a download failure without extracting', async () => {
		exec.mockImplementation(() => {
			throw new Error('Download failed');
		});
		await expect(installChrome('120', platform)).rejects.toThrow('Download failed');
		expect(exec).toHaveBeenCalledTimes(1);
		expect(rm).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
		expect(appendFile).not.toHaveBeenCalled();
	});

	it('does not extract an unreadable archive', async () => {
		exec.mockReturnValue(Buffer.alloc(0));
		await expect(installChrome('120', platform)).rejects.toThrow();
		expect(exec).toHaveBeenCalledTimes(1);
		expect(appendFile).not.toHaveBeenCalled();
	});

	it('rejects unsupported platforms and unlocked majors', async () => {
		await expect(installChrome('120', '../../other')).rejects.toThrow('Unsupported');
		await expect(installChrome('121', platform)).rejects.toThrow('not locked');
		expect(exec).not.toHaveBeenCalled();
	});
});

describe('Chrome lock update', () => {
	it('collects missing matrix checksums without extraction before updating the version lock', async () => {
		await updateLock();
		expect(exec.mock.calls.map(([command]) => command)).toEqual(['curl', 'curl', 'curl']);
		expect(writeFile).toHaveBeenNthCalledWith(
			1,
			checksumPath,
			`${JSON.stringify({ ...checksums, [nextVersion]: allPlatforms }, null, '\t')}\n`
		);
		expect(writeFile).toHaveBeenNthCalledWith(
			2,
			lockPath,
			`${JSON.stringify({ '120': version, '121': nextVersion }, null, '\t')}\n`
		);
		expect(rm).toHaveBeenCalledTimes(3);
		expect(appendFile).not.toHaveBeenCalled();
	});

	it('preserves existing checksums without downloading or replacing them', async () => {
		checksums[nextVersion] = { ...allPlatforms, linux64: 'b'.repeat(64) };
		await updateLock();
		expect(exec).not.toHaveBeenCalled();
		expect(writeFile).toHaveBeenCalledWith(
			checksumPath,
			`${JSON.stringify(checksums, null, '\t')}\n`
		);
	});

	it('rejects invalid existing checksums rather than replacing them', async () => {
		checksums[version][platform] = 'invalid';
		await expect(updateLock()).rejects.toThrow('Missing or invalid');
		expect(exec).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
	});

	it('keeps both locks unchanged and cleans up on download failure', async () => {
		exec.mockImplementation(() => {
			throw new Error('Download failed');
		});
		await expect(updateLock()).rejects.toThrow('Download failed');
		expect(writeFile).not.toHaveBeenCalled();
		expect(rm).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
	});
});
