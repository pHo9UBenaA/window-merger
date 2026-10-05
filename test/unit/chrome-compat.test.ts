import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chromeMatrix, validateChromeVersions } from '../../scripts/chrome-compat';

const lock = JSON.parse(
	readFileSync(new URL('../browser/chrome-versions.json', import.meta.url), 'utf8')
);
const manifest = JSON.parse(
	readFileSync(new URL('../../src/assets/manifest.json', import.meta.url), 'utf8')
);
const minimum = Number(manifest.minimum_chrome_version.split('.')[0]);

describe('Chrome compatibility lock', () => {
	it('covers every supported major starting at the manifest minimum', () => {
		expect(validateChromeVersions(lock, minimum)).toBe(lock);
	});

	it('runs the identical major list on all three platforms', () => {
		const { include } = chromeMatrix(lock);
		expect(include).toHaveLength(Object.keys(lock).length * 3);
		for (const [os, platform] of [
			['ubuntu-24.04', 'linux64'],
			['windows-2025', 'win64'],
			['macos-15', 'mac-arm64'],
		]) {
			expect(include.filter((entry) => entry.os === os)).toEqual(
				Object.keys(lock).map((major) => ({ os, platform, major }))
			);
		}
	});

	it.each([
		{},
		{ '121': '121.0.1.1' },
		{ '120': '120.0.1.1', '122': '122.0.1.1' },
		{ '120': '121.0.1.1' },
		{ '120': '120.0.1' },
		{ '120': '120.0.1.1', invalid: 'invalid' },
	])('rejects an incomplete or invalid lock: %j', (versions) => {
		expect(() => validateChromeVersions(versions as Record<string, string>, 120)).toThrow();
	});
});
