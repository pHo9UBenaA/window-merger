/**
 * Type contract tests.
 * These tests protect TypeScript API contracts from accidental regressions.
 */

import { expectTypeOf, it } from 'vitest';
import { createChromeTabAdapter } from '../../../src/adapters/chrome/tab';
import { createChromeWindowAdapter } from '../../../src/adapters/chrome/window';
import {
	createGroupId,
	createTabId,
	createWindowId,
	type GroupId,
	type TabId,
	type WindowId,
	type WindowSnapshot,
} from '../../../src/core/types/window-merge';

it('createWindowId returns WindowId or null', () => {
	expectTypeOf(createWindowId(1)).toEqualTypeOf<WindowId | null>();
	expectTypeOf(createWindowId(0)).toEqualTypeOf<WindowId | null>();
});

it('createTabId returns TabId or null', () => {
	expectTypeOf(createTabId(1)).toEqualTypeOf<TabId | null>();
	expectTypeOf(createTabId(0)).toEqualTypeOf<TabId | null>();
});

it('createGroupId returns GroupId or null', () => {
	expectTypeOf(createGroupId(1)).toEqualTypeOf<GroupId | null>();
	expectTypeOf(createGroupId(0)).toEqualTypeOf<GroupId | null>();
});

it('adapters expose domain-based method contracts', () => {
	expectTypeOf(createChromeWindowAdapter().getAllWindows).returns.toEqualTypeOf<
		Promise<readonly WindowSnapshot[]>
	>();
	expectTypeOf(createChromeTabAdapter().moveTabs).parameter(0).toEqualTypeOf<readonly TabId[]>();
	expectTypeOf(createChromeTabAdapter().moveTabs).parameter(1).toEqualTypeOf<{
		readonly windowId: WindowId;
		readonly index: number;
	}>();
});
