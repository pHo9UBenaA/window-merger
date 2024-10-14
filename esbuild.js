const srcDirName = 'src';
const distDirName = 'dist';

const path = require('path');
const glob = require('glob');

const srcDir = path.join(__dirname, srcDirName);
const distDir = path.join(__dirname, distDirName);

const optionsStatic = {
	bundle: true,
	minify: true,
	treeShaking: true,
	platform: 'browser',
	tsconfig: './tsconfig.json',
};

const copyStaticFiles = require('esbuild-copy-static-files');
const copyAssets = copyStaticFiles({
	src: `./${srcDirName}/assets`,
	dest: `./${distDirName}`,
	dereference: true,
	errorOnExist: false,
});

const outdir = `${distDir}`;
const entryPoints = glob.sync(`${srcDir}/*.ts`);

const tsOption = {
	...optionsStatic,
	outdir,
	entryPoints,
	outbase: `./${srcDirName}`,
	plugins: [copyAssets],
};

const { build } = require('esbuild');
build(tsOption).catch((err) => {
	process.stderr.write(err.stderr);
	process.exit(1);
});
