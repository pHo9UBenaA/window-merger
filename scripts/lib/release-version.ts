import { resolve } from 'node:path';
import { validateVersionsCommand } from '../release/commands.generated.ts';
import { gitReadCommand } from './commands.generated.ts';
import { runNode } from './run-node.ts';
import { releaseVersion } from './version.ts';

const checkVersions = (commit: string, directory: string): string => {
	const cwd = resolve(directory);
	const read = (path: string): string =>
		runNode<string>(gitReadCommand(cwd), { args: ['show', `${commit}:${path}`], cwd }, cwd);
	return runNode<string>(
		validateVersionsCommand(cwd),
		{
			packageJson: read('package.json'),
			manifestJson: read('src/assets/manifest.json'),
		},
		cwd
	);
};

export const checkRelease = (ref: string, commit: string, cwd: string): string | null => {
	const version = releaseVersion(ref);
	if (version === null) return null;
	const packageVersion = checkVersions(commit, cwd);
	if (packageVersion !== version) {
		throw new Error(`Release ${ref} does not match package version ${packageVersion}`);
	}
	return version;
};
