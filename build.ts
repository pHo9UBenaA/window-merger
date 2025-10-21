import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG = {
	src: {
		dirName: 'src',
		get path() {
			return join(__dirname, this.dirName);
		},
	},
	dist: {
		dirName: 'dist',
		get path() {
			return join(__dirname, this.dirName);
		},
	},
};

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

/**
 * Get all TypeScript entry files (*.ts) directly under the src directory
 */
const getEntrypoints = async (srcPath: string): Promise<string[]> => {
	const entries = await readdir(srcPath, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && extname(entry.name) === '.ts')
		.map((entry) => join(srcPath, entry.name));
};

const clearDist = async () => {
	await rm(CONFIG.dist.path, { recursive: true, force: true });
};

const copyStaticFiles = async () => {
	const assetsPath = join(CONFIG.src.path, 'assets');
	const files = await collectFiles(assetsPath);

	for (const file of files) {
		const relativePath = relative(assetsPath, file);
		const destPath = join(CONFIG.dist.path, relativePath);
		await mkdir(dirname(destPath), { recursive: true });
		await copyFile(file, destPath);
	}
};

const buildScripts = async (minify: boolean) => {
	const entrypoints = await getEntrypoints(CONFIG.src.path);

	await esbuild({
		entryPoints: entrypoints,
		bundle: true,
		minify,
		target: 'chrome120',
		format: 'esm',
		outdir: CONFIG.dist.path,
		outbase: CONFIG.src.dirName,
		platform: 'browser',
	});
};

const run = async (minify: boolean) => {
	process.stdout.write('Clearing dist directory...\n');
	await clearDist();

	process.stdout.write('Copying static files...\n');
	await copyStaticFiles();

	process.stdout.write('Building...\n');
	await buildScripts(minify);
};

const args = process.argv.slice(2);
const minify = args.includes('--minify');

run(minify);
