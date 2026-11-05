import { expect, it } from 'vitest';
import type { VersionCheckSnapshot } from '../../scripts/lib/version';
import { validateReleaseChecks } from '../../scripts/release/check';
import { planReleaseCheck } from '../../scripts/release/plan-check';

const snapshot = (
	refs: readonly string[] = [],
	packageVersion: unknown = '1.4.10',
	manifestVersion: unknown = packageVersion
): VersionCheckSnapshot => ({
	commit: 'abc123',
	refs,
	packageJson: JSON.stringify({ version: packageVersion }),
	manifestJson: JSON.stringify({ version: manifestVersion }),
});

it.each(['feature/example', 'main', ''])('requests a version consistency check for %j', (ref) => {
	expect(planReleaseCheck(ref, 'HEAD')).toEqual([{ commit: 'HEAD', refs: [] }]);
});

it.each(['release/v1.4.10', 'refs/heads/release/v1.4.10', 'refs/tags/v1.4.10'])(
	'requests a release-ref check for %s',
	(ref) => {
		expect(planReleaseCheck(ref, 'abc123')).toEqual([{ commit: 'abc123', refs: [ref] }]);
	}
);

it('rejects invalid release version components before planning reads', () => {
	expect(() => planReleaseCheck('release/v65536.1.0', 'HEAD')).toThrow(
		'Chrome version components'
	);
});

it('accepts matching local and destination release refs', () => {
	expect(() =>
		validateReleaseChecks([snapshot(['refs/heads/release/v1.4.10', 'refs/tags/v1.4.10'])])
	).not.toThrow();
});

it('checks all refs even after an earlier match', () => {
	expect(() =>
		validateReleaseChecks([snapshot(['release/v1.4.10', 'refs/tags/v1.4.9'])])
	).toThrow('Release refs/tags/v1.4.9 does not match');
});

it('validates package and manifest versions even without a release ref', () => {
	expect(() => validateReleaseChecks([snapshot([], '1.4.9', '1.4.10')])).toThrow(
		'does not match manifest version'
	);
});

it('checks subsequent commits instead of stopping after a successful check', () => {
	expect(() =>
		validateReleaseChecks([snapshot(), { ...snapshot(['v1.4.9']), commit: 'def456' }])
	).toThrow('Release v1.4.9 does not match');
});

it('requires an explicit allow-empty mode for pushes without release refs', () => {
	expect(() => validateReleaseChecks([])).toThrow('Expected at least one');
	expect(() => validateReleaseChecks([], true)).not.toThrow();
});

it.each([null, undefined, {}, '', '[]'])(
	'rejects a missing or malformed producer result: %j',
	(input) => {
		expect(() => validateReleaseChecks(input, true)).toThrow(
			'Expected committed version checks'
		);
	}
);

it.each([
	{},
	{ ...snapshot(), commit: '' },
	{ ...snapshot(), refs: null },
	{ ...snapshot(), packageJson: null },
	{ ...snapshot(), manifestJson: '{' },
])('rejects incomplete or invalid committed file data: %j', (check) => {
	expect(() => validateReleaseChecks([check])).toThrow();
});
