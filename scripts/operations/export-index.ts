import { execFileSync } from 'node:child_process';
import { sep } from 'node:path';
import { snapshotDirectory } from '../runtime/paths.ts';
import { object } from '../runtime/validation.ts';

export const operate = (input: unknown): void => {
	const directory = snapshotDirectory(object(input).directory);
	execFileSync('git', ['checkout-index', '--all', `--prefix=${directory}${sep}`], {
		cwd: process.cwd(),
		stdio: ['ignore', 'ignore', 'pipe'],
	});
};
