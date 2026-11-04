import { spawnSync } from 'node:child_process';
import { constants, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type PathContext = {
	readonly cwd: string;
	readonly temporaryDirectory: string;
	readonly environment: Readonly<NodeJS.ProcessEnv>;
};

export const resolvePermissionArguments = (
	args: readonly string[],
	{ cwd, temporaryDirectory, environment }: PathContext
): string[] => {
	// Shell environment expansion is not portable between POSIX and Windows package scripts.
	const paths: Readonly<Record<string, string | undefined>> = {
		'@tmpdir': temporaryDirectory,
		'@runner-temp': environment.RUNNER_TEMP ?? temporaryDirectory,
		'@github-env': environment.GITHUB_ENV || undefined,
	};
	return args.flatMap((argument) => {
		const match = /^(--allow-fs-(?:read|write)=)(.*)$/.exec(argument);
		if (!match) return [argument];
		const [, flag, value] = match;
		if (value === '' || value === '*') return [argument];
		const aliasMatch = /^(@[^/\\]+)(.*)$/.exec(value);
		// Child tools may change cwd; relative grants must remain anchored to the caller.
		if (!aliasMatch) return [`${flag}${resolve(cwd, value)}`];
		const [, alias, suffix] = aliasMatch;
		if (!(alias in paths)) throw new Error(`Unknown permission path: ${alias}`);
		const path = paths[alias];
		return path === undefined ? [] : [`${flag}${join(resolve(cwd, path), suffix)}`];
	});
};

const runCli = (): void => {
	const args = process.argv.slice(2);
	const separator = args.indexOf('--');
	const flags = args.slice(0, separator);
	if (separator < 1 || separator === args.length - 1 || !flags.includes('--permission')) {
		throw new Error('Use explicit --permission flags, then -- <script> [arguments]');
	}
	const nodeArgs = [
		...resolvePermissionArguments(flags, {
			cwd: process.cwd(),
			temporaryDirectory: tmpdir(),
			environment: process.env,
		}),
		'--',
		...args.slice(separator + 1),
	];
	// A version hook must not inherit broader grants from its release process.
	const { NODE_OPTIONS: _nodeOptions, ...environment } = process.env;
	const result = spawnSync(process.execPath, nodeArgs, { env: environment, stdio: 'inherit' });
	if (result.error) throw result.error;
	process.exitCode =
		result.status ?? (result.signal ? 128 + (constants.signals[result.signal] ?? 0) : 1);
};

if (import.meta.main) {
	try {
		runCli();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
