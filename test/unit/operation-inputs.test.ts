import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { operate as gitRead } from '../../scripts/operations/git-read';
import { checkedRef, temporaryDirectory } from '../../scripts/runtime/paths';
import { inside } from '../../scripts/runtime/validation';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

it.each([
	['push', 'origin', 'main'],
	['config', 'core.sshCommand', 'arbitrary command'],
	['show', '--output=/outside'],
	['show', 'HEAD:unreviewed-file'],
	['rev-parse', '--git-path'],
	['log', '--output=/outside'],
	['diff', '--ext-diff'],
	['ls-files', '--recurse-submodules'],
])('rejects non-allowlisted Git arguments before execution: %j', (...args) => {
	expect(() => gitRead({ args })).toThrow();
	expect(execFileSync).not.toHaveBeenCalled();
});

it.each(['../outside', '/outside', '', 'nested/../../outside'])(
	'rejects a destination outside the output directory: %j',
	(path) => {
		expect(() => inside('/output', path)).toThrow('must stay inside');
	}
);

it.each(['-c', '--upload-pack=command', 'HEAD\nother', 'HEAD\0other'])(
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
