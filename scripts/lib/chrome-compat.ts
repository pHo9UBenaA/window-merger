import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type ChromeVersions = Record<string, string>;
export type ChromeChecksums = Record<string, Record<string, string>>;
export type ChromeUpdatePlan = {
	versions: ChromeVersions;
	checksums: ChromeChecksums;
	downloads: { version: string; platform: string }[];
};
export type ChromeInstallation = { readonly version: string; readonly expectedSha256: string };
type KnownGoodVersion = {
	version: string;
	downloads?: { chrome?: { platform: string }[] };
};

const versionLockPath = () => join(process.cwd(), 'test/browser/chrome-versions.json');
const checksumPath = () => join(process.cwd(), 'test/browser/chrome-checksums.json');
// Only the oldest and newest supported Chrome are exercised per platform. macOS uses
// macos-14 because Chrome for Testing 120 cannot launch on macos-15 arm64.
const platformTargets = {
	'ubuntu-24.04': 'linux64',
	'windows-2025': 'win64',
	'macos-14': 'mac-arm64',
} as const;

export const validateChromeVersions = (
	versions: ChromeVersions,
	minimumMajor: number
): ChromeVersions => {
	const majors = Object.keys(versions)
		.map(Number)
		.toSorted((left, right) => left - right);
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
			Object.entries(platformTargets).map(([os, platform]) => ({
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
		await readFile(join(process.cwd(), 'src/assets/manifest.json'), 'utf8')
	);
	return Number(manifest.minimum_chrome_version.split('.')[0]);
};

const readVersionLock = async (minimumMajor: number): Promise<ChromeVersions> => {
	const versions = JSON.parse(await readFile(versionLockPath(), 'utf8'));
	return validateChromeVersions(versions, minimumMajor);
};

const requireSha256 = (value: unknown): string => {
	if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]+$/.test(value))
		throw new Error('Missing or invalid Chrome SHA-256 in chrome-checksums.json');
	return value;
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
		for (const platform of Object.values(platformTargets)) {
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

export const prepareLockUpdate = async (): Promise<ChromeUpdatePlan> => {
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
	const checksums: ChromeChecksums = JSON.parse(await readFile(checksumPath(), 'utf8'));
	const downloads: { version: string; platform: string }[] = [];
	for (const { major, platform } of chromeMatrix(versions, minimumMajor).include) {
		const version = versions[major];
		const existing = checksums[version]?.[platform];
		if (existing === undefined) downloads.push({ version, platform });
		else requireSha256(existing);
	}
	return { checksums, versions, downloads };
};

export const readInstallation = async (
	major: string,
	platform: string
): Promise<ChromeInstallation> => {
	if (!Object.values(platformTargets).some((candidate) => candidate === platform))
		throw new Error(`Unsupported Chrome for Testing platform: ${platform}`);
	const versions = await readVersionLock(await readMinimumMajor());
	const version = versions[major];
	if (!version) throw new Error(`Chrome major ${major} is not locked`);
	const checksums: ChromeChecksums = JSON.parse(await readFile(checksumPath(), 'utf8'));
	const expectedSha256 = requireSha256(checksums[version]?.[platform]);

	return { version, expectedSha256 };
};

export const readChromeMatrix = async () => {
	const minimumMajor = await readMinimumMajor();
	return chromeMatrix(await readVersionLock(minimumMajor), minimumMajor);
};
