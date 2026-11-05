import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { operate as gitRead, readVersionChecks } from '../../scripts/lib/git-read';
import { checkedRef, temporaryDirectory } from '../../scripts/lib/script-paths';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

it.each([
	['push', 'origin', 'main'],
	['config', 'core.sshCommand', 'arbitrary command'],
	['show', '--output=/outside'],
	['show', 'HEAD:unreviewed-file'],
	['rev-parse', '--git-path'],
	['diff', '--ext-diff'],
])('rejects non-allowlisted Git arguments before execution: %j', (...args) => {
	expect(() => gitRead({ args })).toThrow();
	expect(execFileSync).not.toHaveBeenCalled();
});

it.each(
	[
		null,
		[{ commit: '--output=/outside', refs: [] }],
		[{ commit: 'HEAD:unreviewed-file', refs: [] }],
		[{ commit: 'HEAD', refs: null }],
		[
			{ commit: 'HEAD', refs: [] },
			{ commit: '-c', refs: [] },
		],
	].map((input) => ({ input }))
)('rejects malformed version-read requests before starting Git: %j', ({ input }) => {
	expect(() => readVersionChecks(input)).toThrow();
	expect(execFileSync).not.toHaveBeenCalled();
});

it.each(['-c', 'HEAD\nother', 'HEAD\0other'])(
	'rejects option-like or multiline Git refs: %j',
	(ref) => {
		expect(() => checkedRef(ref)).toThrow();
	}
);

it('rejects temporary paths outside the designated parent and prefix', () => {
	for (const path of [
		'/other/prefix-owned',
		'/tmp/unrelated',
		'/tmp/prefix-',
		'/tmp/prefix-owned/child',
	])
		expect(() => temporaryDirectory(path, '/tmp', 'prefix-')).toThrow();
	expect(temporaryDirectory('/tmp/prefix-owned', '/tmp', 'prefix-')).toBe('/tmp/prefix-owned');
});
