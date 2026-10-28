import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROJECT_ROOT } from './build.ts';

type ChromeVersions = Record<string, string>;
type ChromeChecksums = Record<string, Record<string, string>>;
type KnownGoodVersion = {
	version: string;
	downloads?: { chrome?: { platform: string }[] };
};

const versionLockPath = join(PROJECT_ROOT, 'test/browser/chrome-versions.json');
const checksumPath = join(PROJECT_ROOT, 'test/browser/chrome-checksums.json');
// Only the oldest and newest supported Chrome are exercised per platform. macOS uses
// macos-14 because Chrome for Testing 120 cannot launch on macos-15 arm64.
const platformTargets = {
	'ubuntu-24.04': { platform: 'linux64', executableRelativePath: 'chrome' },
	'windows-2025': { platform: 'win64', executableRelativePath: 'chrome.exe' },
	'macos-14': {
		platform: 'mac-arm64',
		executableRelativePath:
			'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
	},
} as const;

export const validateChromeVersions = (
	versions: ChromeVersions,
	minimumMajor: number
): ChromeVersions => {
	const majors = Object.keys(versions).map(Number);
	majors.sort((left, right) => left - right);
	if (majors.length === 0 || majors[0] !== minimumMajor)
		throw new Error(`Chrome lock must start at manifest minimum ${minimumMajor}`);
	for (const [index, major] of majors.entries()) {
		const expectedMajor = minimumMajor + index;
		const versionMatchesMajor = new RegExp(`^${major}\\.\\d+\\.\\d+\\.\\d+$`).test(
			versions[major]
		);
		if (major !== expectedMajor || !versionMatchesMajor)
			throw new Error(`Missing or invalid locked Chrome major ${expectedMajor}`);
	}
	return versions;
};

export const chromeMatrix = (versions: ChromeVersions, minimumMajor: number) => {
	const latestMajor = Number(Object.keys(versions).at(-1));
	const boundaryMajors = [minimumMajor, latestMajor];
	return {
		include: boundaryMajors.flatMap((major) =>
			Object.entries(platformTargets).map(([os, { platform }]) => ({
				os,
				platform,
				major: String(major),
			}))
		),
	};
};

const fetchJson = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
	return response.json();
};

const readMinimumMajor = async (): Promise<number> => {
	const manifest = JSON.parse(
		await readFile(join(PROJECT_ROOT, 'src/assets/manifest.json'), 'utf8')
	);
	return Number(manifest.minimum_chrome_version.split('.')[0]);
};

const readVersionLock = async (minimumMajor: number): Promise<ChromeVersions> => {
	const versions = JSON.parse(await readFile(versionLockPath, 'utf8'));
	return validateChromeVersions(versions, minimumMajor);
};

const hashFileSha256 = async (path: string): Promise<string> => {
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
	const hasValidVersion = /^\d+\.\d+\.\d+\.\d+$/.test(version);
	const isSupportedPlatform = Object.values(platformTargets).some(
		(target) => target.platform === platform
	);
	if (!hasValidVersion || !isSupportedPlatform)
		throw new Error('Invalid Chrome archive version or platform');

	const archivePath = join(directory, 'chrome.zip');
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
			archivePath,
			url,
		],
		{ stdio: 'inherit' }
	);
	return archivePath;
};

const selectChromeVersions = (
	milestones: Record<string, { version: string }>,
	knownVersions: KnownGoodVersion[],
	minimumMajor: number,
	stableMajor: number
): ChromeVersions => {
	const downloadsByVersion = new Map(knownVersions.map((entry) => [entry.version, entry]));
	const versions: ChromeVersions = {};
	for (let major = minimumMajor; major <= stableMajor; major++) {
		const version = milestones[major]?.version;
		const downloads = downloadsByVersion.get(version)?.downloads?.chrome;
		for (const { platform } of Object.values(platformTargets)) {
			const hasPlatformDownload = downloads?.some((entry) => entry.platform === platform);
			if (!hasPlatformDownload)
				throw new Error(
					`No full Chrome ${version ?? major} for ${platform}; lock unchanged`
				);
		}
		versions[major] = version;
	}
	return validateChromeVersions(versions, minimumMajor);
};

const collectChromeChecksums = async (
	versions: ChromeVersions,
	minimumMajor: number
): Promise<ChromeChecksums> => {
	const checksums: ChromeChecksums = JSON.parse(await readFile(checksumPath, 'utf8'));
	for (const { major, platform } of chromeMatrix(versions, minimumMajor).include) {
		const version = versions[major];
		const existingSha256 = checksums[version]?.[platform];
		if (existingSha256 !== undefined) {
			requireSha256(existingSha256);
			continue;
		}
		// New hashes trust the first official HTTPS download; existing pins are preserved.
		const temporaryDirectory = await mkdtemp(join(tmpdir(), 'window-merger-chrome-hash-'));
		try {
			const archivePath = downloadChromeArchive(version, platform, temporaryDirectory);
			checksums[version] = {
				...checksums[version],
				[platform]: await hashFileSha256(archivePath),
			};
		} finally {
			await rm(temporaryDirectory, { recursive: true, force: true });
		}
	}
	return checksums;
};

export const updateLock = async (): Promise<void> => {
	const [milestoneVersions, channelVersions, downloadVersions] = await Promise.all([
		fetchJson(
			'https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone.json'
		),
		fetchJson(
			'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json'
		),
		fetchJson(
			'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json'
		),
	]);
	const minimumMajor = await readMinimumMajor();
	const stableMajor = Number(channelVersions.channels.Stable.version.split('.')[0]);
	const versions = selectChromeVersions(
		milestoneVersions.milestones,
		downloadVersions.versions,
		minimumMajor,
		stableMajor
	);
	const checksums = await collectChromeChecksums(versions, minimumMajor);

	// Publish the version lock only after all required checksums have been collected.
	await writeFile(checksumPath, `${JSON.stringify(checksums, null, '\t')}\n`);
	await writeFile(versionLockPath, `${JSON.stringify(versions, null, '\t')}\n`);
};

export const installChrome = async (major: string, platform: string): Promise<void> => {
	const target = Object.values(platformTargets).find(
		(candidate) => candidate.platform === platform
	);
	if (!target) throw new Error(`Unsupported Chrome for Testing platform: ${platform}`);
	const versions = await readVersionLock(await readMinimumMajor());
	const version = versions[major];
	if (!version) throw new Error(`Chrome major ${major} is not locked`);
	const checksums: ChromeChecksums = JSON.parse(await readFile(checksumPath, 'utf8'));
	const expectedSha256 = requireSha256(checksums[version]?.[platform]);

	const installDirectory = await mkdtemp(
		join(process.env.RUNNER_TEMP ?? tmpdir(), 'window-merger-chrome-')
	);
	const archivePath = join(installDirectory, 'chrome.zip');
	try {
		downloadChromeArchive(version, platform, installDirectory);
		const actualSha256 = await hashFileSha256(archivePath);
		if (actualSha256 !== expectedSha256)
			throw new Error(
				`Chrome SHA-256 mismatch for ${version}/${platform}; refusing to extract`
			);
		execFileSync('unzip', ['-q', archivePath, '-d', installDirectory]);

		const executablePath = join(
			installDirectory,
			`chrome-${platform}`,
			target.executableRelativePath
		);
		const githubEnvPath = process.env.GITHUB_ENV;
		if (githubEnvPath) {
			await appendFile(
				githubEnvPath,
				`CHROME_EXECUTABLE_PATH=${executablePath}\nCHROME_MAJOR=${major}\nHEADED=1\n`
			);
		}
		console.log(JSON.stringify({ version, executablePath }));
	} catch (error) {
		await rm(installDirectory, { recursive: true, force: true });
		throw error;
	} finally {
		await rm(archivePath, { force: true });
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
				const minimumMajor = await readMinimumMajor();
				const versions = await readVersionLock(minimumMajor);
				console.log(JSON.stringify(chromeMatrix(versions, minimumMajor)));
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
