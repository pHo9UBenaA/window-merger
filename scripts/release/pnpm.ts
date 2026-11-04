import { execFileSync } from 'node:child_process';
import { choice, object } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { pnpmCommand } from '../lib/pnpm-command.ts';
import { releaseCheckout } from '../lib/script-paths.ts';
import { validateReleaseVersion } from '../lib/version.ts';

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
	// An empty NODE_OPTIONS would re-inject these grants into pnpm's lifecycle CLIs.
	const env = Object.fromEntries(
		Object.entries({ ...process.env, NODE_OPTIONS: '--permission --no-permission' }).filter(
			([name]) => !name.startsWith('GIT_')
		)
	);
	const command = pnpmCommand(args, env);
	return execFileSync(command.executable, command.args, {
		cwd,
		env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
};

if (import.meta.main) await runJsonCli(operate);
