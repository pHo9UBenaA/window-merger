import { execFileSync } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildExtension, PROJECT_ROOT } from '../build.ts';
import { validateExtension } from './validate-extension.ts';

export const packageExtension = async (root = PROJECT_ROOT): Promise<void> => {
	const archive = resolve(root, 'dist.zip');
	const temporary = resolve(root, 'dist.tmp.zip');
	await rm(archive, { force: true });
	await rm(temporary, { force: true });
	try {
		await buildExtension({ root, minify: true });
		const directory = join(root, 'dist');
		await validateExtension(directory);
		// Archive files only, without platform-specific metadata.
		execFileSync('zip', ['-qr9', '-X', '-D', temporary, '.', '-x', '*.DS_Store'], {
			cwd: directory,
			stdio: 'inherit',
		});
		await rename(temporary, archive);
	} finally {
		await rm(temporary, { force: true });
	}
};

if (import.meta.main) {
	try {
		await packageExtension();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
