import { join } from 'node:path';
import { expect, it } from 'vitest';
import { pnpmCommand } from '../../scripts/lib/pnpm-command';

it('runs a JavaScript pnpm entry point through Node', () => {
	const entry = join('/tools', 'pnpm.cjs');
	expect(pnpmCommand(['--version'], { npm_execpath: entry })).toEqual({
		executable: process.execPath,
		args: [entry, '--version'],
	});
});

it('does not run npm when a caller inherited its entry point', () => {
	expect(pnpmCommand(['--version'], { npm_execpath: join('/tools', 'npm-cli.js') })).toEqual({
		executable: 'pnpm',
		args: ['--version'],
	});
});
