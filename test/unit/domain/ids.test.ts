import { expect, it } from 'vitest';
import { isValidId } from '../../../src/domain/window-merge.types';

it.each([
	[0, true],
	[-1, false],
	[0x7fffffff, true],
	[0x80000000, false],
	[1.5, false],
	[NaN, false],
] as const)('validates Chrome integer IDs: %s -> %s', (value, valid) => {
	expect(isValidId(value)).toBe(valid);
});
