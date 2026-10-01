import { execFileSync } from 'node:child_process';
import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { buildExtension, collectFiles, PROJECT_ROOT } from '../build.ts';
import { validateExtension } from './validate-extension.ts';

const withoutDescriptions = (messages: Record<string, Record<string, unknown>>) =>
	Object.fromEntries(
		Object.entries(messages).map(([name, { description: _description, ...message }]) => [
			name,
			message,
		])
	);

const compactJsonAssets = async (directory: string): Promise<void> => {
	const files = (await collectFiles(directory)).filter((file) => file.endsWith('.json'));
	for (const file of files) {
		const data = JSON.parse(await readFile(file, 'utf8'));
		const isLocale =
			relative(directory, file).startsWith(`_locales${sep}`) &&
			basename(file) === 'messages.json';
		const content = isLocale ? withoutDescriptions(data) : data;
		await writeFile(file, JSON.stringify(content));
	}
};

export const packageExtension = async (root = PROJECT_ROOT): Promise<void> => {
	const archive = resolve(root, 'dist.zip');
	const temporary = resolve(root, 'dist.tmp.zip');
	await rm(archive, { force: true });
	await rm(temporary, { force: true });
	try {
		await buildExtension({ root, minify: true });
		const directory = join(root, 'dist');
		await copyFile(join(root, 'LICENSE'), join(directory, 'LICENSE'));
		await compactJsonAssets(directory);
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
