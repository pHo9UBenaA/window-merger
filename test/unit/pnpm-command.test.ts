import { join } from 'node:path';
import { expect, it } from 'vitest';
import { pnpmCommand } from '../../scripts/lib/pnpm-command';

it.each(['pnpm', 'pnpm-native', 'pnpm.exe', 'pnpm-native.exe'])(
	'runs the native %s executable without Node or permission overrides',
	(name) => {
		const executable = join('/tools', name);
		expect(pnpmCommand(['audit', '--json'], { npm_execpath: executable })).toEqual({
			executable,
			args: ['audit', '--json'],
		});
	}
);

it.each(['pnpm.js', 'pnpm.cjs', 'pnpm.mjs'])(
	'runs the JavaScript %s entry point through Node without disabling permissions',
	(name) => {
		const entry = join('/tools', name);
		expect(pnpmCommand(['--version'], { npm_execpath: entry })).toEqual({
			executable: process.execPath,
			args: [entry, '--version'],
		});
	}
);

it.each([undefined, join('/tools', 'npm-cli.js')])(
	'falls back to PATH when npm_execpath is not pnpm: %s',
	(entry) => {
		expect(pnpmCommand(['--version'], { npm_execpath: entry })).toEqual({
			executable: 'pnpm',
			args: ['--version'],
		});
	}
);
