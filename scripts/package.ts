import { execFileSync } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildExtension, PROJECT_ROOT } from './build.ts';
import { validateExtension } from './lib/validate-extension.ts';

export const packageExtension = async (root = PROJECT_ROOT): Promise<void> => {
	const archivePath = resolve(root, 'dist.zip');
	const temporaryArchivePath = resolve(root, 'dist.tmp.zip');
	await rm(archivePath, { force: true });
	await rm(temporaryArchivePath, { force: true });
	try {
		await buildExtension({ root });
		const outputDirectory = join(root, 'dist');
		await validateExtension(outputDirectory);
		// Archive files only, without platform-specific metadata.
		execFileSync('zip', ['-qr9', '-X', '-D', temporaryArchivePath, '.', '-x', '*.DS_Store'], {
			cwd: outputDirectory,
			stdio: 'inherit',
		});
		await rename(temporaryArchivePath, archivePath);
	} finally {
		await rm(temporaryArchivePath, { force: true });
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
