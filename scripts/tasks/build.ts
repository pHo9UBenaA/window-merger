import { type FSWatcher, watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { callOperation } from '../runtime/client.ts';

type ExtensionBuildOptions = { readonly root?: string; readonly minify?: boolean };
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

const createAssetSync = (root: string, watching = false) => {
	let previousNames = new Set<string>();
	return async () => {
		const directory = join(root, 'src/assets');
		const files: { name: string; data: string }[] = [];
		for (const path of await collectFiles(directory, watching)) {
			const name = relative(directory, path);
			try {
				files.push({ name, data: await assetData(path, name) });
			} catch (error) {
				if (!watching || !isMissing(error)) throw error;
			}
		}
		const currentNames = new Set(files.map(({ name }) => name));
		await callOperation('build-assets', {
			action: 'sync',
			files,
			removed: [...previousNames].filter((name) => !currentNames.has(name)),
		});
		previousNames = currentNames;
	};
};

const compile = async (root: string, minify: boolean): Promise<void> => {
	const manifest = JSON.parse(await readFile(join(root, 'src/assets/manifest.json'), 'utf8'));
	await callOperation('bundle', { major: manifest.minimum_chrome_version.split('.')[0], minify });
};

const prepare = async (root: string): Promise<void> => {
	await callOperation('build-assets', { action: 'reset' });
	const data = (await readFile(join(root, 'LICENSE'))).toString('base64');
	await callOperation('build-assets', {
		action: 'sync',
		files: [{ name: 'LICENSE', data }],
		removed: [],
	});
};

export const buildExtension = async ({
	root = process.cwd(),
	minify = true,
}: ExtensionBuildOptions = {}): Promise<void> => {
	await prepare(root);
	await createAssetSync(root)();
	await compile(root, minify);
};

export const watchExtension = async (
	{ root = process.cwd(), minify = true }: ExtensionBuildOptions = {},
	onError: (error: unknown) => void = console.error
): Promise<() => Promise<void>> => {
	await prepare(root);
	const syncAssets = createAssetSync(root, true);
	let pending = Promise.resolve();
	const rebuild = async () => {
		await syncAssets();
		await compile(root, minify);
	};
	const watcher: FSWatcher = watch(join(root, 'src'), { recursive: true }, () => {
		pending = pending.then(rebuild).catch(onError);
	});
	watcher.on('error', onError);
	try {
		await rebuild();
	} catch (error) {
		watcher.close();
		throw error;
	}
	return async () => {
		watcher.close();
		await pending;
	};
};

if (import.meta.main) {
	try {
		const minify = !process.argv.includes('--no-minify');
		if (process.argv.includes('--watch')) {
			const dispose = await watchExtension({ minify });
			const stop = () => {
				void dispose().catch(console.error);
			};
			process.once('SIGINT', stop);
			process.once('SIGTERM', stop);
			console.log('Watching source and assets. Reload the extension after changes.');
		} else await buildExtension({ minify });
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
