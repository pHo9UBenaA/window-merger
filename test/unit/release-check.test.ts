import { expect, it } from 'vitest';
import { validateReleaseChecks } from '../../scripts/release/check';
import { planReleaseCheck } from '../../scripts/release/plan-check';

it('includes the release ref in the committed version request', () => {
	expect(planReleaseCheck('release/v1.4.10', 'abc123')).toEqual([
		{ commit: 'abc123', refs: ['release/v1.4.10'] },
	]);
});

it('checks subsequent commits instead of stopping after a successful check', () => {
	const files = {
		packageJson: '{"version":"1.4.10"}',
		manifestJson: '{"version":"1.4.10"}',
	};
	expect(() =>
		validateReleaseChecks([
			{ ...files, commit: 'abc123', refs: ['v1.4.10'] },
			{ ...files, commit: 'def456', refs: ['v1.4.9'] },
		])
	).toThrow('Release v1.4.9 does not match');
});
