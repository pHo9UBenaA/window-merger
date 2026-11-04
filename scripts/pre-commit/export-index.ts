import { execFileSync } from 'node:child_process';
import { sep } from 'node:path';
import { object } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { snapshotDirectory } from '../lib/script-paths.ts';

export const operate = (input: unknown): void => {
	const directory = snapshotDirectory(object(input).directory);
	execFileSync('git', ['checkout-index', '--all', `--prefix=${directory}${sep}`], {
		cwd: process.cwd(),
		stdio: ['ignore', 'ignore', 'pipe'],
	});
};

if (import.meta.main) await runJsonCli(operate);
