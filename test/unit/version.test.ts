import { expect, it } from 'vitest';
import { validateReleaseVersion, validateVersion } from '../../scripts/lib/version';

it.each(['01.2', '1.2.3.4.5', '65536', '0.0.0', '1.0-beta'])(
	'rejects invalid extension version %s',
	(version) => {
		expect(() => validateVersion(version)).toThrow();
	}
);

it.each(['0.1', '65535.65535.65535.65535'])('accepts extension version %s', (version) => {
	expect(validateVersion(version)).toBe(version);
});

it('requires three components for release versions even though Chrome accepts four', () => {
	expect(() => validateReleaseVersion('1.2.3.4')).toThrow('three numeric components');
});
