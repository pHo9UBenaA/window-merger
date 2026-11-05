import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chromeMatrix, validateChromeVersions } from '../../scripts/lib/chrome-compat';

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
	it('runs only the oldest and newest Chrome on all three platforms', () => {
		const versions = { '120': '120.0.1.1', '121': '121.0.1.1', '122': '122.0.1.1' };
		const matrix = chromeMatrix(versions, 120).include;
		expect(matrix).toHaveLength(6);
		expect(matrix).toEqual(
			expect.arrayContaining([
				{ os: 'ubuntu-24.04', platform: 'linux64', major: '120' },
				{ os: 'windows-2025', platform: 'win64', major: '120' },
				{ os: 'macos-14', platform: 'mac-arm64', major: '120' },
				{ os: 'ubuntu-24.04', platform: 'linux64', major: '122' },
				{ os: 'windows-2025', platform: 'win64', major: '122' },
				{ os: 'macos-14', platform: 'mac-arm64', major: '122' },
			])
		);
	});

	it('locks every supported major and pins every boundary download', () => {
		validateChromeVersions(lock, minimum);
		for (const { major, platform } of chromeMatrix(lock, minimum).include) {
			const pin = checksums[lock[major]]?.[platform];
			expect(pin).toMatch(/^[a-f0-9]{64}$/);
		}
	});

	it.each<Record<string, string>>([
		{ '120': '120.0.1.1', '122': '122.0.1.1' },
		{ '120': '121.0.1.1' },
	])('rejects an incomplete or invalid lock: %j', (versions) => {
		expect(() => validateChromeVersions(versions, 120)).toThrow();
	});
});
