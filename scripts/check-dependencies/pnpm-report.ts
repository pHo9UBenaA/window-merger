import { spawnSync } from 'node:child_process';
import { pnpmCommand } from '../lib/pnpm-command.ts';
import { toolEnvironment } from '../lib/tool-environment.ts';

export const pnpmReport = (kind: 'audit' | 'list') => {
	if (!process.env.npm_execpath) throw new Error('Run this check via pnpm check:dependencies');
	const args =
		kind === 'audit'
			? ['audit', '--json']
			: ['list', '--lockfile-only', '--depth', 'Infinity', '--json'];
	const command = pnpmCommand(args);
	const result = spawnSync(command.executable, command.args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 60_000,
		maxBuffer: 16 * 1024 * 1024,
		env: toolEnvironment(['--allow-fs-read=*', '--allow-child-process']),
	});
	return {
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		status: result.status,
		signal: result.signal,
		error: result.error?.message,
	};
};
