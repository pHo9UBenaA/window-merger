import { execFileSync } from 'node:child_process';
import { pnpmCommand } from '../lib/pnpm-command.ts';
import { validateReleaseVersion } from '../lib/version.ts';
import { releaseCheckout } from '../runtime/paths.ts';
import { toolEnvironment } from '../runtime/tool-environment.ts';
import { choice, object } from '../runtime/validation.ts';

export const operate = (input: unknown): string => {
	const request = object(input);
	const cwd = releaseCheckout(request.cwd);
	const action = choice(request.action, ['prefix', 'version']);
	const version = action === 'version' ? validateReleaseVersion(request.version) : '';
	const args =
		action === 'prefix'
			? ['config', 'get', 'tagVersionPrefix', '--json']
			: [
					'version',
					version,
					'--allow-same-version',
					'--message',
					`chore: release ${version}`,
				];
	const env = Object.fromEntries(
		Object.entries(
			toolEnvironment([
				'--allow-fs-read=*',
				`--allow-fs-write=${cwd}`,
				'--allow-child-process',
			])
		).filter(([name]) => !name.startsWith('GIT_'))
	);
	const command = pnpmCommand(args, env);
	return execFileSync(command.executable, command.args, {
		cwd,
		env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
};
