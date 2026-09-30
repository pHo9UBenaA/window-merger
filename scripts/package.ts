import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';
import { buildExtension, collectFiles, PROJECT_ROOT } from '../build.ts';
import { validateExtension } from './validate-extension.ts';

export const packageExtension = async (root = PROJECT_ROOT): Promise<void> => {
	const archive = join(root, 'dist.zip');
	const temporary = join(root, '.package-tmp');
	await rm(archive, { force: true });
	await rm(temporary, { recursive: true, force: true });
	try {
		await buildExtension({ root, minify: true });
		const directory = join(root, 'dist');
		await validateExtension(directory);
		const contents: Record<string, Uint8Array> = {};
		for (const file of await collectFiles(directory)) {
			contents[relative(directory, file).split(sep).join('/')] = await readFile(file);
		}
		await mkdir(temporary);
		const output = join(temporary, 'dist.zip');
		await writeFile(output, zipSync(contents, { level: 9 }));
		await rename(output, archive);
	} finally {
		await rm(temporary, { recursive: true, force: true });
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
