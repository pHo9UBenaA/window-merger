const srcDirName = 'src';
const distDirName = 'dist';

const path = require('path');
const glob = require('glob');

const srcDir = path.join(__dirname, srcDirName);
const distDir = path.join(__dirname, distDirName);

const directories = ['window-merger'];

const optionsStatic = {
	bundle: true,
	minify: true,
	treeShaking: true,
	platform: 'browser',
	tsconfig: './tsconfig.json',
};

const tsOptionsArray = directories.map((dir) => {
	const entryPoints = glob.sync(`${srcDir}/${dir}/*.ts`);
	const outdir = `${distDir}/${dir}`;

	const copyStaticFiles = require('esbuild-copy-static-files');
	const copyAssets = copyStaticFiles({
		src: `./${srcDirName}/${dir}/assets`,
		dest: `./${distDirName}/${dir}`,
		dereference: true,
		errorOnExist: false,
	});

	const options = {
		...optionsStatic,
		entryPoints,
		outdir,
		outbase: `./${srcDirName}/${dir}`,
		plugins: [copyAssets],
	};

	return options;
});

const tsxOptionsArray = directories.map((dir) => {
	const entryPoints = glob.sync(`${srcDir}/${dir}/options.tsx`);
	const outdir = `${distDir}/${dir}`;

	const options = {
		...optionsStatic,
		entryPoints,
		outdir,
	};

	return options;
});

const { build } = require('esbuild');
tsOptionsArray.forEach((options) => {
	build(options).catch((err) => {
		process.stderr.write(err.stderr);
		process.exit(1);
	});
});

tsxOptionsArray.forEach((options) => {
	build(options).catch((err) => {
		process.stderr.write(err.stderr);
		process.exit(1);
	});
});
