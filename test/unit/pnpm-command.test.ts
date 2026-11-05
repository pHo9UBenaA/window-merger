import { join } from 'node:path';
import { expect, it } from 'vitest';
import { pnpmCommand } from '../../scripts/lib/pnpm-command';

it('runs a native pnpm executable without wrapping it in Node', () => {
	const executable = join('/tools', 'pnpm-native.exe');
	expect(pnpmCommand(['audit', '--json'], { npm_execpath: executable })).toEqual({
		executable,
		args: ['audit', '--json'],
	});
});

it('runs a JavaScript pnpm entry point through Node', () => {
	const entry = join('/tools', 'pnpm.cjs');
	expect(pnpmCommand(['--version'], { npm_execpath: entry })).toEqual({
		executable: process.execPath,
		args: [entry, '--version'],
	});
});

it.each([undefined, join('/tools', 'npm-cli.js')])(
	'falls back to PATH when npm_execpath is not pnpm: %s',
	(entry) => {
		expect(pnpmCommand(['--version'], { npm_execpath: entry })).toEqual({
			executable: 'pnpm',
			args: ['--version'],
		});
	}
);
