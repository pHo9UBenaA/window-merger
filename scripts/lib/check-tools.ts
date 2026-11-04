import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { choice, inside, object, strings } from './input.ts';
import { runJsonCli } from './json-cli.ts';
import { snapshotDirectory } from './script-paths.ts';
import { toolEnvironment } from './tool-environment.ts';

export const operate = (input: unknown): void => {
	const request = object(input);
	const tool = choice(request.tool, ['secretlint', 'biome']);
	const snapshot =
		request.snapshot === undefined ? undefined : snapshotDirectory(request.snapshot);
	const cwd = snapshot ?? process.cwd();
	const files = tool === 'secretlint' ? strings(request.files) : [];
	for (const file of files) inside(cwd, file);
	if (tool === 'biome' && !snapshot) throw new Error('Biome requires an index snapshot');
	const args =
		tool === 'biome'
			? [
					'ci',
					'--config-path',
					join(cwd, 'biome.json'),
					'--vcs-enabled=false',
					'.',
					'--error-on-warnings',
				]
			: [
					...(snapshot ? ['--secretlintrc', join(cwd, '.secretlintrc.json')] : []),
					'--no-gitignore',
					'--no-glob',
					'--',
					...files,
				];
	const toolPermission = tool === 'biome' ? '--allow-child-process' : '--allow-worker';
	// Inherited Git paths would make snapshot checks inspect the original checkout.
	const env = Object.fromEntries(
		Object.entries(toolEnvironment(['--allow-fs-read=*', toolPermission])).filter(
			([name]) => !name.startsWith('GIT_')
		)
	);
	execFileSync(join(process.cwd(), 'node_modules/.bin', tool), args, {
		cwd,
		env,
		stdio: ['ignore', 'ignore', 'inherit'],
	});
};

if (import.meta.main) await runJsonCli(operate);
