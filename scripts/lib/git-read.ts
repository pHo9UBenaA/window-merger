import { execFileSync } from 'node:child_process';
import { choice, object, strings } from './input.ts';
import { runJsonCli } from './json-cli.ts';
import { checkedRef, gitDirectory } from './script-paths.ts';
import type { VersionCheckSnapshot } from './version.ts';

const validateArguments = (args: readonly string[]): void => {
	const [command, ...rest] = args;
	const signature = args.join(' ');
	if (
		[
			'diff --cached --name-only --no-renames -z',
			'ls-files -z',
			'ls-remote --tags origin',
			'status --porcelain',
		].includes(signature)
	)
		return;
	if (command === 'show' && rest.length === 1) {
		const separator = rest[0].indexOf(':');
		if (separator < 1) throw new Error('Expected committed version file');
		checkedRef(rest[0].slice(0, separator));
		choice(rest[0].slice(separator + 1), ['package.json', 'src/assets/manifest.json']);
		return;
	}
	if (command === 'rev-parse' && rest.length === 1) {
		checkedRef(rest[0]);
		return;
	}
	if (
		command === 'rev-list' &&
		rest.length === 4 &&
		rest.slice(0, 3).join(' ') === '--parents -n 1'
	) {
		checkedRef(rest[3]);
		return;
	}
	if (command === 'log' && rest.length === 3 && rest.slice(0, 2).join(' ') === '-1 --format=%s') {
		checkedRef(rest[2]);
		return;
	}
	throw new Error('Unsupported Git read');
};

export const operate = (input: unknown): string => {
	const request = object(input);
	const args = strings(request.args);
	validateArguments(args);
	return execFileSync('git', args, {
		cwd: gitDirectory(request.cwd),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...(request.isolated === true
			? {
					env: Object.fromEntries(
						Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
					),
				}
			: {}),
	});
};

export const readVersionChecks = (input: unknown): VersionCheckSnapshot[] => {
	if (!Array.isArray(input)) throw new Error('Expected version-check requests');
	const requests = input.map((value) => {
		const request = object(value);
		return { commit: checkedRef(request.commit), refs: strings(request.refs) };
	});
	const snapshots: VersionCheckSnapshot[] = [];
	for (const request of requests) {
		const packageJson = operate({ args: ['show', `${request.commit}:package.json`] });
		const manifestJson = operate({
			args: ['show', `${request.commit}:src/assets/manifest.json`],
		});
		snapshots.push({ ...request, packageJson, manifestJson });
	}
	return snapshots;
};

if (import.meta.main) {
	if (process.argv[2] === '--version-checks') await runJsonCli(readVersionChecks);
	else {
		const input =
			process.argv[2] === '--tracked-files'
				? () => ({ args: ['ls-files', '-z'] })
				: undefined;
		await runJsonCli(operate, input);
	}
}
