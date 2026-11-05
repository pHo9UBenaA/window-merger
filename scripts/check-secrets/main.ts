import { execFileSync } from 'node:child_process';
import { inside } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';

export const checkSecrets = (trackedPaths: unknown): void => {
	if (typeof trackedPaths !== 'string') throw new Error('Expected Git tracked paths');
	const files = trackedPaths
		.split('\0')
		.filter(Boolean)
		.map((file) => inside(process.cwd(), file));
	const help = (() => {
		try {
			return execFileSync('betterleaks', ['--help'], { encoding: 'utf8' });
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
				throw new Error(
					'Warning: betterleaks is not installed or not on PATH. Install it before running pnpm check:secrets.'
				);
			throw error;
		}
	})();
	if (files.length === 0) return;
	// Betterleaks v2 renamed v1's dir subcommand to filesystem.
	const command = /\bfilesystem\b/.test(help) ? 'filesystem' : 'dir';
	execFileSync(
		'betterleaks',
		[
			command,
			...(command === 'dir' ? ['--verbose'] : []),
			'--redact',
			'--no-banner',
			'--',
			...files,
		],
		{ stdio: ['ignore', 'inherit', 'inherit'] }
	);
};

if (import.meta.main) await runJsonCli(checkSecrets);
