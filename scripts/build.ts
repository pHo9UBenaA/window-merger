import { type FSWatcher, watch as watchDirectory } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	type BuildOptions as EsbuildOptions,
	build as esbuild,
	context as esbuildContext,
} from 'esbuild';

export const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
type ExtensionBuildOptions = { root?: string; minify?: boolean };

const isMissingFileError = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

export const collectFiles = async (directory: string, ignoreMissing = false): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
		if (ignoreMissing && isMissingFileError(error)) return [];
		throw error;
	});
	const fileReads: Promise<string[]>[] = [];
	for (const entry of entries) {
		if (entry.name === '.DS_Store') continue;
		const path = join(directory, entry.name);
		fileReads.push(
			entry.isDirectory() ? collectFiles(path, ignoreMissing) : Promise.resolve([path])
		);
	}
	return (await Promise.all(fileReads)).flat();
};

const stripMessageDescriptions = (messages: Record<string, Record<string, unknown>>) =>
	Object.fromEntries(
		Object.entries(messages).map(([name, { description: _description, ...message }]) => [
			name,
			message,
		])
	);

const copyAsset = async (
	assetsDirectory: string,
	assetName: string,
	destinationPath: string
): Promise<void> => {
	const sourcePath = join(assetsDirectory, assetName);
	if (!assetName.endsWith('.json')) return copyFile(sourcePath, destinationPath);
	const data = JSON.parse(await readFile(sourcePath, 'utf8'));
	const isLocaleMessages =
		assetName.startsWith(`_locales${sep}`) && basename(assetName) === 'messages.json';
	await writeFile(
		destinationPath,
		JSON.stringify(isLocaleMessages ? stripMessageDescriptions(data) : data)
	);
};

const resetOutputDirectory = async (root: string): Promise<void> => {
	const outputDirectory = join(root, 'dist');
	await rm(outputDirectory, { recursive: true, force: true });
	await mkdir(outputDirectory, { recursive: true });
	await copyFile(join(root, 'LICENSE'), join(outputDirectory, 'LICENSE'));
};

const createAssetSync = (root: string, watching = false) => {
	const assetsDirectory = join(root, 'src/assets');
	const outputDirectory = join(root, 'dist');
	let previousAssetNames = new Set<string>();
	return async () => {
		const files = await collectFiles(assetsDirectory, watching);
		const currentAssetNames = new Set(files.map((file) => relative(assetsDirectory, file)));
		for (const name of previousAssetNames) {
			if (!currentAssetNames.has(name)) {
				await rm(join(outputDirectory, name), { force: true });
			}
		}
		for (const name of currentAssetNames) {
			const destinationPath = join(outputDirectory, name);
			await mkdir(dirname(destinationPath), { recursive: true });
			try {
				await copyAsset(assetsDirectory, name, destinationPath);
			} catch (error) {
				if (!watching || !isMissingFileError(error)) throw error;
				// A deletion may race with directory enumeration; remove any stale output too.
				currentAssetNames.delete(name);
				await rm(destinationPath, { force: true });
			}
		}
		previousAssetNames = currentAssetNames;
	};
};

const createBuildOptions = async (root: string, minify: boolean): Promise<EsbuildOptions> => {
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
}: ExtensionBuildOptions = {}): Promise<void> => {
	await resetOutputDirectory(root);
	const syncAssets = createAssetSync(root);
	await syncAssets();
	await esbuild(await createBuildOptions(root, minify));
};

export const watchExtension = async (
	{ root = PROJECT_ROOT, minify = true }: ExtensionBuildOptions = {},
	onError: (error: unknown) => void = console.error
): Promise<() => Promise<void>> => {
	await resetOutputDirectory(root);
	const syncAssets = createAssetSync(root, true);
	let pendingAssetSync = Promise.resolve();
	const queueAssetSync = () => {
		pendingAssetSync = pendingAssetSync.then(syncAssets).catch(onError);
	};
	const buildContext = await esbuildContext(await createBuildOptions(root, minify));
	let assetWatcher: FSWatcher | undefined;
	try {
		assetWatcher = watchDirectory(
			join(root, 'src/assets'),
			{ recursive: true },
			queueAssetSync
		);
		assetWatcher.on('error', onError);
		queueAssetSync();
		await pendingAssetSync;
		await buildContext.watch();
	} catch (error) {
		assetWatcher?.close();
		await buildContext.dispose();
		throw error;
	}
	return async () => {
		assetWatcher?.close();
		await pendingAssetSync;
		await buildContext.dispose();
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
