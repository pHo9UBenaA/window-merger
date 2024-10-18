const { build } = require('esbuild');
const path = require('node:path');
const glob = require('glob');
const copyStaticFiles = require('esbuild-copy-static-files');

const CONFIG = {
	src: {
		dirName: 'src',
		get path() {
			return path.join(__dirname, this.dirName);
		},
		get entryPoints() {
			return glob.sync(`${this.path}/*.ts`);
		}
	},
	dist: {
		dirName: 'dist',
		get path() {
			return path.join(__dirname, this.dirName);
		}
	}
};

const buildOptions = {
	bundle: true,
	minify: true,
	treeShaking: true,
	platform: 'browser',
	tsconfig: './tsconfig.json',
	outdir: CONFIG.dist.path,
	entryPoints: CONFIG.src.entryPoints,
	outbase: `./${CONFIG.src.dirName}`,
	plugins: [
		copyStaticFiles({
			src: `./${CONFIG.src.dirName}/assets`,
			dest: `./${CONFIG.dist.dirName}`,
			dereference: true,
			errorOnExist: false,
		})
	]
};

build(buildOptions).catch((err) => {
	process.stderr.write(err.stderr);
	process.exit(1);
});
