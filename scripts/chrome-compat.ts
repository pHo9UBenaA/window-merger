import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROJECT_ROOT } from './build.ts';

const lockPath = join(PROJECT_ROOT, 'test/browser/chrome-versions.json');
const checksumPath = join(PROJECT_ROOT, 'test/browser/chrome-checksums.json');
type Checksums = Record<string, Record<string, string>>;
// Only the oldest and newest supported Chrome are exercised per platform. macOS uses
// macos-14 because Chrome for Testing 120 cannot launch on macos-15 arm64.
const platforms = {
	'ubuntu-24.04': { platform: 'linux64', executable: 'chrome' },
	'windows-2025': { platform: 'win64', executable: 'chrome.exe' },
	'macos-14': {
		platform: 'mac-arm64',
		executable: 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
	},
} as const;

export const validateChromeVersions = (
	lock: Record<string, string>,
	minimumMajor: number
): Record<string, string> => {
	const majors = Object.keys(lock)
		.map(Number)
		.sort((a, b) => a - b);
	if (majors.length === 0 || majors[0] !== minimumMajor)
		throw new Error(`Chrome lock must start at manifest minimum ${minimumMajor}`);
	for (const [index, major] of majors.entries()) {
		if (
			major !== minimumMajor + index ||
			!new RegExp(`^${major}\\.\\d+\\.\\d+\\.\\d+$`).test(lock[major])
		)
			throw new Error(`Missing or invalid locked Chrome major ${minimumMajor + index}`);
	}
	return lock;
};

export const chromeMatrix = (lock: Record<string, string>, minimumMajor: number) => {
	const majors = [minimumMajor, Number(Object.keys(lock).at(-1))];
	return {
		include: majors.flatMap((major) =>
			Object.entries(platforms).map(([os, { platform }]) => ({
				os,
				platform,
				major: String(major),
			}))
		),
	};
};

type KnownGoodVersion = {
	version: string;
	downloads?: { chrome?: { platform: string }[] };
};

const getJson = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
	return response.json();
};

const minimumMajor = async (): Promise<number> => {
	const manifest = JSON.parse(
		await readFile(join(PROJECT_ROOT, 'src/assets/manifest.json'), 'utf8')
	);
	return Number(manifest.minimum_chrome_version.split('.')[0]);
};

const readLock = async (minimum: number): Promise<Record<string, string>> =>
	validateChromeVersions(JSON.parse(await readFile(lockPath, 'utf8')), minimum);

const sha256File = async (path: string): Promise<string> => {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
};

const requireSha256 = (value: unknown): string => {
	if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]+$/.test(value))
		throw new Error('Missing or invalid Chrome SHA-256 in chrome-checksums.json');
	return value;
};

const downloadChromeArchive = (version: string, platform: string, directory: string): string => {
	if (
		!/^\d+\.\d+\.\d+\.\d+$/.test(version) ||
		!Object.values(platforms).some((target) => target.platform === platform)
	)
		throw new Error('Invalid Chrome archive version or platform');
	const archive = join(directory, 'chrome.zip');
	const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chrome-${platform}.zip`;
	// Stream to disk; redirects may never downgrade HTTPS.
	execFileSync(
		'curl',
		[
			'--fail',
			'--location',
			'--proto',
			'=https',
			'--proto-redir',
			'=https',
			'--retry',
			'3',
			'--output',
			archive,
			url,
		],
		{ stdio: 'inherit' }
	);
	return archive;
};

export const updateLock = async (): Promise<void> => {
	const [latest, channels, known] = await Promise.all([
		getJson(
			'https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone.json'
		),
		getJson(
			'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json'
		),
		getJson(
			'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json'
		),
	]);
	const minimum = await minimumMajor();
	const stable = Number(channels.channels.Stable.version.split('.')[0]);
	const availableByVersion = new Map<string, KnownGoodVersion>(
		known.versions.map((entry: KnownGoodVersion) => [entry.version, entry])
	);
	const lock: Record<string, string> = {};
	for (let major = minimum; major <= stable; major++) {
		const version = latest.milestones[major]?.version;
		const available = availableByVersion.get(version);
		for (const { platform } of Object.values(platforms)) {
			if (!available?.downloads?.chrome?.some((entry) => entry.platform === platform))
				throw new Error(
					`No full Chrome ${version ?? major} for ${platform}; lock unchanged`
				);
		}
		lock[major] = version;
	}
	validateChromeVersions(lock, minimum);
	const checksums: Checksums = JSON.parse(await readFile(checksumPath, 'utf8'));
	for (const { major, platform } of chromeMatrix(lock, minimum).include) {
		const version = lock[major];
		const existing = checksums[version]?.[platform];
		if (existing !== undefined) {
			requireSha256(existing);
			continue;
		}
		// New hashes trust the first official HTTPS download; existing pins are preserved.
		const directory = await mkdtemp(join(tmpdir(), 'window-merger-chrome-hash-'));
		try {
			const archive = downloadChromeArchive(version, platform, directory);
			checksums[version] = {
				...checksums[version],
				[platform]: await sha256File(archive),
			};
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}
	// Publish the version lock only after all required checksums have been collected.
	await writeFile(checksumPath, `${JSON.stringify(checksums, null, '\t')}\n`);
	await writeFile(lockPath, `${JSON.stringify(lock, null, '\t')}\n`);
};

export const installChrome = async (major: string, platform: string): Promise<void> => {
	const target = Object.values(platforms).find((candidate) => candidate.platform === platform);
	if (!target) throw new Error(`Unsupported Chrome for Testing platform: ${platform}`);
	const lock = await readLock(await minimumMajor());
	const version = lock[major];
	if (!version) throw new Error(`Chrome major ${major} is not locked`);
	const checksums: Checksums = JSON.parse(await readFile(checksumPath, 'utf8'));
	const expectedSha256 = requireSha256(checksums[version]?.[platform]);
	const directory = await mkdtemp(
		join(process.env.RUNNER_TEMP ?? tmpdir(), 'window-merger-chrome-')
	);
	const archive = join(directory, 'chrome.zip');
	try {
		downloadChromeArchive(version, platform, directory);
		if ((await sha256File(archive)) !== expectedSha256)
			throw new Error(
				`Chrome SHA-256 mismatch for ${version}/${platform}; refusing to extract`
			);
		execFileSync('unzip', ['-q', archive, '-d', directory]);
		const executablePath = join(directory, `chrome-${platform}`, target.executable);
		if (process.env.GITHUB_ENV) {
			await appendFile(
				process.env.GITHUB_ENV,
				`CHROME_EXECUTABLE_PATH=${executablePath}\nCHROME_MAJOR=${major}\nHEADED=1\n`
			);
		}
		console.log(JSON.stringify({ version, executablePath }));
	} catch (error) {
		await rm(directory, { recursive: true, force: true });
		throw error;
	} finally {
		await rm(archive, { force: true });
	}
};

if (import.meta.main) {
	try {
		const [command, major, platform] = process.argv.slice(2);
		switch (command) {
			case '--update-lock':
				await updateLock();
				break;
			case '--matrix': {
				const minimum = await minimumMajor();
				console.log(JSON.stringify(chromeMatrix(await readLock(minimum), minimum)));
				break;
			}
			case '--install':
				await installChrome(major, platform);
				break;
			default:
				throw new Error('Use --update-lock, --matrix, or --install <major> <platform>');
		}
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
