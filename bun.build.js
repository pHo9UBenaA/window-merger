const path = require('node:path');
const glob = require('glob');
const fs = require('node:fs').promises;

const CONFIG = {
	src: {
		dirName: 'src',
		get path() {
			return path.join(__dirname, this.dirName);
		},
	},
	dist: {
		dirName: 'dist',
		get path() {
			return path.join(__dirname, this.dirName);
		},
	},
};

const clearDist = async () => {
	await fs.rm(CONFIG.dist.path, { recursive: true, force: true });
};

const copyStaticFiles = async () => {
	const entries = glob.sync(`${CONFIG.src.path}/assets/**`, { nodir: true });
	await Promise.all(
		entries.map(async (entry) => {
			const relativePath = path.relative(`${CONFIG.src.path}/assets`, entry);
			const destPath = path.join(CONFIG.dist.path, relativePath);
			await fs.mkdir(path.dirname(destPath), { recursive: true });
			await fs.copyFile(entry, destPath);
		})
	);
};

const build = async () => {
	const buildOptions = {
		minify: true,
		target: 'browser',
		outdir: CONFIG.dist.path,
		root: CONFIG.src.dirName,
		entrypoints: glob.sync(`${CONFIG.src.path}/*.ts`),
	};

	await Bun.build(buildOptions);
};

const run = async () => {
	process.stdout.write('Clearing dist directory...\n');
	await clearDist();

	process.stdout.write('Copying static files...\n');
	await copyStaticFiles();

	process.stdout.write('Building...\n');
	await build();
};

run();
