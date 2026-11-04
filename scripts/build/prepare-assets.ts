import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { object, strings } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';

const isMissing = (error: unknown) =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';
export const collectFiles = async (directory: string, ignoreMissing = false): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
		if (ignoreMissing && isMissing(error)) return [];
		throw error;
	});
	const reads: Promise<string[]>[] = [];
	for (const entry of entries) {
		if (entry.name === '.DS_Store') continue;
		const path = join(directory, entry.name);
		reads.push(
			entry.isDirectory() ? collectFiles(path, ignoreMissing) : Promise.resolve([path])
		);
	}
	return (await Promise.all(reads)).flat();
};

const assetData = async (path: string, name: string): Promise<string> => {
	const source = await readFile(path);
	if (!name.endsWith('.json')) return source.toString('base64');
	const data = JSON.parse(source.toString('utf8'));
	const locale = name.startsWith(`_locales${sep}`) && basename(name) === 'messages.json';
	const compact = locale
		? Object.fromEntries(
				Object.entries<Record<string, unknown>>(data).map(
					([key, { description: _description, ...value }]) => [key, value]
				)
			)
		: data;
	return Buffer.from(JSON.stringify(compact)).toString('base64');
};

export const prepareAssets = async (input: unknown) => {
	const request = object(input);
	const root = process.cwd();
	const directory = join(root, 'src/assets');
	const files = [
		{ name: 'LICENSE', data: (await readFile(join(root, 'LICENSE'))).toString('base64') },
	];
	for (const path of await collectFiles(directory, request.watching === true)) {
		const name = relative(directory, path);
		try {
			files.push({ name, data: await assetData(path, name) });
		} catch (error) {
			if (request.watching !== true || !isMissing(error)) throw error;
		}
	}
	const names = files.map(({ name }) => name);
	const current = new Set(names);
	const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
	return {
		action: 'sync',
		files,
		names,
		major: manifest.minimum_chrome_version.split('.')[0],
		removed: strings(request.previous ?? []).filter((name) => !current.has(name)),
	};
};

if (import.meta.main) await runJsonCli(prepareAssets);
