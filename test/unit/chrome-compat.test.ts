import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chromeMatrix, validateChromeVersions } from '../../scripts/chrome-compat';

const lock = JSON.parse(
	readFileSync(new URL('../browser/chrome-versions.json', import.meta.url), 'utf8')
);
const checksums = JSON.parse(
	readFileSync(new URL('../browser/chrome-checksums.json', import.meta.url), 'utf8')
);
const manifest = JSON.parse(
	readFileSync(new URL('../../src/assets/manifest.json', import.meta.url), 'utf8')
);
const minimum = Number(manifest.minimum_chrome_version.split('.')[0]);

describe('Chrome compatibility lock', () => {
	it('covers every supported major starting at the manifest minimum', () => {
		expect(validateChromeVersions(lock, minimum)).toBe(lock);
	});

	it('runs only the oldest and newest Chrome on all three platforms', () => {
		const latest = Object.keys(lock).at(-1);
		expect(chromeMatrix(lock, minimum).include).toEqual(
			[minimum, Number(latest)].flatMap((major) => [
				{ os: 'ubuntu-24.04', platform: 'linux64', major: String(major) },
				{ os: 'windows-2025', platform: 'win64', major: String(major) },
				{ os: 'macos-14', platform: 'mac-arm64', major: String(major) },
			])
		);
	});

	it('has a valid pinned SHA-256 for every compatibility matrix download', () => {
		for (const { major, platform } of chromeMatrix(lock, minimum).include) {
			const pin = checksums[lock[major]]?.[platform];
			expect(pin).toMatch(/^[a-f0-9]{64}$/);
		}
	});

	it.each<Record<string, string>>([
		{},
		{ '121': '121.0.1.1' },
		{ '120': '120.0.1.1', '122': '122.0.1.1' },
		{ '120': '121.0.1.1' },
		{ '120': '120.0.1' },
		{ '120': '120.0.1.1', invalid: 'invalid' },
	])('rejects an incomplete or invalid lock: %j', (versions) => {
		expect(() => validateChromeVersions(versions, 120)).toThrow();
	});
});
