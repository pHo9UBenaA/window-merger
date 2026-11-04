import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createOperationScope } from '../../scripts/runtime/scope';

it('permits snapshot operations only for directories created by the same task', () => {
	const scope = createOperationScope('/project', 'pre-commit');
	const owned = '/project/.window-merger-index-owned';
	const other = '/project/.window-merger-index-other';
	scope.record('snapshot', { action: 'create' }, owned);
	expect(() => scope.check('export-index', { directory: owned })).not.toThrow();
	expect(() => scope.check('export-index', { directory: other })).toThrow('does not belong');
	expect(() => scope.check('check-tools', { snapshot: other })).toThrow('does not belong');
	expect(() => scope.check('snapshot', { action: 'remove', directory: other })).toThrow(
		'does not belong'
	);
	scope.record('snapshot', { action: 'remove', directory: owned }, null);
	expect(() => scope.check('export-index', { directory: owned })).toThrow('does not belong');
});

it('confines release reads and mutations to the current checkout', () => {
	const scope = createOperationScope('/project', 'release');
	const directory = '/temporary/window-merger-release-owned';
	scope.record('release-directory', { action: 'create' }, directory);
	for (const operation of ['git-read', 'release-git', 'release-pnpm']) {
		expect(() => scope.check(operation, { cwd: join(directory, 'checkout') })).not.toThrow();
		expect(() => scope.check(operation, { cwd: '/other/checkout' })).toThrow('does not belong');
	}
	expect(() => scope.check('git-read', { cwd: '/project' })).not.toThrow();
	expect(() => scope.check('release-git', { cwd: '/project' })).toThrow('does not belong');
});

it('separates download purposes and restricts extraction to the current installation', () => {
	const installer = createOperationScope('/project', 'chrome-install');
	const updater = createOperationScope('/project', 'chrome-update');
	const directory = '/temporary/window-merger-chrome-install-owned';
	expect(() => installer.check('chrome-download', { purpose: 'hash' })).toThrow('not permitted');
	expect(() => updater.check('chrome-download', { purpose: 'install' })).toThrow('not permitted');
	expect(() => installer.check('chrome-extract', { directory })).toThrow('does not belong');
	installer.record('chrome-download', { purpose: 'install' }, { directory });
	expect(() => installer.check('chrome-extract', { directory })).not.toThrow();
	expect(() => installer.check('chrome-environment', { directory: '/other' })).toThrow(
		'does not belong'
	);
	installer.record('chrome-download', { purpose: 'install', remove: directory }, null);
	expect(() => installer.check('chrome-extract', { directory })).toThrow('does not belong');
});
