import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';
import { buildExtension, collectFiles, PROJECT_ROOT } from '../build.ts';
import { validateExtension } from './validate-extension.ts';

export const packageExtension = async (root = PROJECT_ROOT): Promise<void> => {
	const archive = join(root, 'dist.zip');
	const temporary = `${archive}.tmp`;
	await rm(archive, { force: true });
	await rm(temporary, { force: true });
	try {
		await buildExtension({ root, minify: true });
		const directory = join(root, 'dist');
		await validateExtension(directory);
		const contents: Record<string, Uint8Array> = {};
		for (const file of await collectFiles(directory)) {
			contents[relative(directory, file).split(sep).join('/')] = await readFile(file);
		}
		await writeFile(temporary, zipSync(contents, { level: 9 }));
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
