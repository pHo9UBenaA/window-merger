import { expect, it } from 'vitest';
import { prepareSecretCheck } from '../../scripts/check-secrets/main';

it('splits only NUL delimiters and preserves all filename characters', () => {
	expect(prepareSecretCheck('file with spaces.md\0line\nbreak.md\0--leading-dash.md\0')).toEqual({
		tool: 'secretlint',
		files: ['file with spaces.md', 'line\nbreak.md', '--leading-dash.md'],
	});
});

it('accepts an explicitly empty Git result', () => {
	expect(prepareSecretCheck('')).toEqual({ tool: 'secretlint', files: [] });
});

it.each([null, undefined, {}, [], 0])(
	'rejects a missing or malformed producer result: %j',
	(input) => {
		expect(() => prepareSecretCheck(input)).toThrow('Expected Git tracked paths');
	}
);
