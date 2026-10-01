import { type FSWatcher, watch as watchDirectory } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BuildOptions, build as esbuild, context as esbuildContext } from 'esbuild';

export const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
type Options = { root?: string; minify?: boolean };

const isMissing = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

export const collectFiles = async (dir: string, ignoreMissing = false): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
		if (ignoreMissing && isMissing(error)) return [];
		throw error;
	});
	const files = await Promise.all(
		entries
			.filter((entry) => entry.name !== '.DS_Store')
			.map(async (entry) => {
				const path = join(dir, entry.name);
				return entry.isDirectory() ? collectFiles(path, ignoreMissing) : [path];
			})
	);
	return files.flat();
};

const withoutDescriptions = (messages: Record<string, Record<string, unknown>>) =>
	Object.fromEntries(
		Object.entries(messages).map(([name, { description: _description, ...message }]) => [
			name,
			message,
		])
	);

const copyAsset = async (assets: string, name: string, destination: string): Promise<void> => {
	const source = join(assets, name);
	if (!name.endsWith('.json')) return copyFile(source, destination);
	const data = JSON.parse(await readFile(source, 'utf8'));
	const isLocale = name.startsWith(`_locales${sep}`) && basename(name) === 'messages.json';
	await writeFile(destination, JSON.stringify(isLocale ? withoutDescriptions(data) : data));
};

const prepareOutput = async (root: string): Promise<void> => {
	const directory = join(root, 'dist');
	await rm(directory, { recursive: true, force: true });
	await mkdir(directory, { recursive: true });
	await copyFile(join(root, 'LICENSE'), join(directory, 'LICENSE'));
};

const assetSync = (root: string, watching = false) => {
	let previous = new Set<string>();
	return async () => {
		const assets = join(root, 'src/assets');
		const files = await collectFiles(assets, watching);
		const current = new Set(files.map((file) => relative(assets, file)));
		for (const name of previous) {
			if (!current.has(name)) {
				await rm(join(root, 'dist', name), { force: true });
			}
		}
		for (const name of current) {
			const destination = join(root, 'dist', name);
			await mkdir(dirname(destination), { recursive: true });
			try {
				await copyAsset(assets, name, destination);
			} catch (error) {
				if (!watching || !isMissing(error)) throw error;
				// A deletion may race with directory enumeration; remove any stale output too.
				current.delete(name);
				await rm(destination, { force: true });
			}
		}
		previous = current;
	};
};

const buildOptions = async (root: string, minify: boolean): Promise<BuildOptions> => {
	const manifest = JSON.parse(await readFile(join(root, 'src/assets/manifest.json'), 'utf8'));
	return {
		entryPoints: [join(root, 'src/background.ts')],
		bundle: true,
		minify,
		target: `chrome${manifest.minimum_chrome_version.split('.')[0]}`,
		format: 'esm',
		outdir: join(root, 'dist'),
		platform: 'browser',
	};
};

export const buildExtension = async ({
	root = PROJECT_ROOT,
	minify = true,
}: Options = {}): Promise<void> => {
	await prepareOutput(root);
	await assetSync(root)();
	await esbuild(await buildOptions(root, minify));
};

export const watchExtension = async (
	{ root = PROJECT_ROOT, minify = true }: Options = {},
	onError: (error: unknown) => void = console.error
): Promise<() => Promise<void>> => {
	await prepareOutput(root);
	const sync = assetSync(root, true);
	let pending = Promise.resolve();
	const refresh = () => {
		pending = pending.then(sync).catch(onError);
	};
	const context = await esbuildContext(await buildOptions(root, minify));
	let watcher: FSWatcher | undefined;
	try {
		watcher = watchDirectory(join(root, 'src/assets'), { recursive: true }, refresh);
		watcher.on('error', onError);
		refresh();
		await pending;
		await context.watch();
	} catch (error) {
		watcher?.close();
		await context.dispose();
		throw error;
	}
	return async () => {
		watcher?.close();
		await pending;
		await context.dispose();
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
		} else {
			await buildExtension({ minify });
		}
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
