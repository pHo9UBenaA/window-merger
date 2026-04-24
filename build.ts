import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BuildOptions, build as esbuild, context as esbuildContext } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_DIR_NAME = 'src';
const SRC_PATH = join(__dirname, SRC_DIR_NAME);
const DIST_PATH = join(__dirname, 'dist');
const ASSETS_PATH = join(SRC_PATH, 'assets');

// Chrome extension entry points. Add popup/content/options scripts here
// as they're introduced; files only referenced by these stay internal.
const ENTRYPOINTS = ['background.ts'];

/**
 * Recursively collect all file paths under the given directory
 */
const collectFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = join(dir, entry.name);
			return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
		})
	);
	return files.flat();
};

const clearDist = async () => {
	await rm(DIST_PATH, { recursive: true, force: true });
};

const copyStaticFiles = async () => {
	const files = await collectFiles(ASSETS_PATH);
	await Promise.all(
		files.map(async (file) => {
			const relativePath = relative(ASSETS_PATH, file);
			const destPath = join(DIST_PATH, relativePath);
			await mkdir(dirname(destPath), { recursive: true });
			await copyFile(file, destPath);
		})
	);
};

const buildOptions = (minify: boolean): BuildOptions => ({
	entryPoints: ENTRYPOINTS.map((entry) => join(SRC_PATH, entry)),
	bundle: true,
	minify,
	target: 'chrome120',
	format: 'esm',
	outdir: DIST_PATH,
	outbase: SRC_DIR_NAME,
	platform: 'browser',
});

const run = async (minify: boolean, watch: boolean) => {
	process.stdout.write('Clearing dist directory...\n');
	await clearDist();

	process.stdout.write('Copying static files...\n');
	await copyStaticFiles();

	if (watch) {
		process.stdout.write('Starting watch build...\n');
		const ctx = await esbuildContext(buildOptions(minify));
		await ctx.watch();
		process.stdout.write('Watching for changes. Press Ctrl+C to stop.\n');
		return;
	}

	process.stdout.write('Building...\n');
	await esbuild(buildOptions(minify));
};

const args = process.argv.slice(2);
const minify = args.includes('--minify');
const watch = args.includes('--watch');

try {
	await run(minify, watch);
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
