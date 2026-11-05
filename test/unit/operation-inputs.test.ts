import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { operate as gitRead, readVersionChecks } from '../../scripts/lib/git-read';
import { temporaryDirectory } from '../../scripts/lib/script-paths';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

it.each([
	['push', 'origin', 'main'],
	['show', 'HEAD:unreviewed-file'],
	['show', '-c:package.json'],
])('rejects mutations, unrelated reads and option injection before running Git: %j', (...args) => {
	expect(() => gitRead({ args })).toThrow();
	expect(execFileSync).not.toHaveBeenCalled();
});

it('validates the entire batch before reading any committed files', () => {
	expect(() =>
		readVersionChecks([
			{ commit: 'HEAD', refs: [] },
			{ commit: '-c', refs: [] },
		])
	).toThrow();
	expect(execFileSync).not.toHaveBeenCalled();
});

it('restricts cleanup to a designated temporary directory', () => {
	for (const path of [
		'/other/prefix-owned',
		'/tmp/unrelated',
		'/tmp/prefix-',
		'/tmp/prefix-owned/child',
	])
		expect(() => temporaryDirectory(path, '/tmp', 'prefix-')).toThrow();
	expect(temporaryDirectory('/tmp/prefix-owned', '/tmp', 'prefix-')).toBe('/tmp/prefix-owned');
});
