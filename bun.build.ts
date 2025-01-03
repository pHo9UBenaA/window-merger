import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { BuildConfig } from 'bun';
import { sync as globSync } from 'glob';

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

const clearDist = async () => {
	await rm(CONFIG.dist.path, { recursive: true, force: true });
};

const copyStaticFiles = async () => {
	const entries: string[] = globSync(`${CONFIG.src.path}/assets/**`, { nodir: true });
	await Promise.all(
		entries.map(async (entry) => {
			const relativePath = relative(`${CONFIG.src.path}/assets`, entry);
			const destPath = join(CONFIG.dist.path, relativePath);
			await mkdir(dirname(destPath), { recursive: true });
			await copyFile(entry, destPath);
		})
	);
};

const build = async (minify: boolean) => {
	const buildOptions: BuildConfig = {
		minify,
		target: 'browser',
		outdir: CONFIG.dist.path,
		root: CONFIG.src.dirName,
		entrypoints: globSync(`${CONFIG.src.path}/*.ts`),
	};

	await Bun.build(buildOptions);
};

const run = async (minify: boolean) => {
	process.stdout.write('Clearing dist directory...\n');
	await clearDist();

	process.stdout.write('Copying static files...\n');
	await copyStaticFiles();

	process.stdout.write('Building...\n');
	await build(minify);
};

const args = process.argv.slice(2);
const minify = args.includes('--minify');

run(minify);
