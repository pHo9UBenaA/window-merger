import { join } from 'node:path';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';

export const fixtureEnvironment = (): NodeJS.ProcessEnv =>
	Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) => name !== 'NODE_OPTIONS' && !name.startsWith('GIT_')
		)
	);

const quote = (value: string): string =>
	process.platform === 'win32' ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`;

export const fixtureCommand = (command: string): string =>
	command
		.split(' ')
		.map((argument) => {
			if (argument === 'node')
				return `${quote(process.execPath)} ${quote(`--allow-fs-read=${join(PROJECT_ROOT, 'package.json')}`)}`;
			if (argument === '--allow-fs-read=./scripts')
				return quote(`--allow-fs-read=${join(PROJECT_ROOT, 'scripts')}`);
			if (argument.startsWith('./scripts/')) return quote(join(PROJECT_ROOT, argument));
			return argument;
		})
		.join(' ');
