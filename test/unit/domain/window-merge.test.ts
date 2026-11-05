import { describe, expect, it } from 'vitest';
import { planMerge } from '../../../src/domain/window-merge';
import {
	createTestTabId,
	createTestWindowId,
	createMockTabSnapshot as tab,
	createMockWindowSnapshot as window,
} from '../../factories/domain';

describe('merge planning', () => {
	it('uses the lowest ID when no window is focused, regardless of array order', () => {
		expect(
			planMerge([
				window(2, [tab(2, { active: true })]),
				window(1, [tab(1, { active: true })]),
			])
		).toMatchObject({ data: { targetWindowId: createTestWindowId(1) } });
	});

	it('finds an active tab in a later source when the target has none', () => {
		expect(
			planMerge([
				window(1, [tab(1)], { focused: true }),
				window(2, [tab(2)]),
				window(3, [tab(3, { active: true })]),
			])
		).toMatchObject({ data: { activeTabId: createTestTabId(3) } });
	});
});
