import { describe, expect, it } from 'vitest';
import { createGroupId, createTabId, createWindowId } from '../../../src/domain/window-merge.types';

describe.each([createWindowId, createTabId, createGroupId])('Chrome ID validation', (create) => {
	it.each([0, 1, 0x7fffffff])('accepts %s', (value) => {
		expect(create(value)?.value).toBe(value);
	});
	it.each([-1, -2, 1.5, NaN, Infinity, -Infinity, 0x80000000])('rejects %s', (value) => {
		expect(create(value)).toBeNull();
	});
});
