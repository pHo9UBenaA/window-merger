import { spawnSync } from 'node:child_process';
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { resolvePermissionArguments } from '../../scripts/run';

const scripts: Record<string, string> = JSON.parse(
	await readFile(new URL('../../package.json', import.meta.url), 'utf8')
).scripts;
const commands: Record<string, string> = {
	build: scripts.build,
	package: scripts.zip,
	'check-dependencies': scripts['check:dependencies'],
	'check-secrets': scripts['check:secrets'],
	'chrome-install': scripts['chrome:install'],
	'chrome-update': scripts['chrome:update-lock'],
	version: scripts.version,
	'pre-commit': await readFile(new URL('../../.githooks/pre-commit', import.meta.url), 'utf8'),
	'pre-push': await readFile(new URL('../../.githooks/pre-push', import.meta.url), 'utf8'),
	matrix: await readFile(
		new URL('../../.github/workflows/browser-matrix.yml', import.meta.url),
		'utf8'
	),
	'release-check': await readFile(
		new URL('../../.github/workflows/ci.yml', import.meta.url),
		'utf8'
	),
	release: await readFile(
		new URL('../../.github/workflows/create-tag-on-merge.yml', import.meta.url),
		'utf8'
	),
};

const nodeInvocation = (source: string) => {
	const command = source.replace(/\\\r?\n\s*/g, ' ').match(/\bnode (--permission\b[^\n]*)/);
	if (!command) throw new Error('Missing permissioned Node command');
	const args = command[1].trim().split(/\s+/);
	const entryIndex = args.findIndex((arg) => !arg.startsWith('--'));
	if (entryIndex < 0 || !args[entryIndex].endsWith('.ts'))
		throw new Error('Missing script entry');
	const runner = basename(args[entryIndex]) === 'run.ts';
	const separator = runner ? args.indexOf('--', entryIndex + 1) : entryIndex;
	if (separator < 0) throw new Error('Missing runner separator');
	return {
		flags: args.slice(runner ? entryIndex + 1 : 0, separator),
		entry: args[runner ? separator + 1 : entryIndex],
		runner,
	};
};

let directory: string;
let root: string;
let temporaryDirectory: string;
let runnerTemporaryDirectory: string;
let githubEnv: string;
let outside: string;
const nodeEnvironment = () => {
	const { NODE_OPTIONS: _options, ...environment } = process.env;
	return environment;
};
const context = () => ({
	cwd: root,
	temporaryDirectory,
	environment: { RUNNER_TEMP: runnerTemporaryDirectory, GITHUB_ENV: githubEnv },
});
const launch = (flags: string[], entry: string, args: string[] = [], input?: string) =>
	spawnSync(
		process.execPath,
		[
			'--permission',
			'--allow-child-process',
			join(root, 'scripts/run.ts'),
			...flags,
			'--',
			entry,
			...args,
		],
		{ cwd: root, env: nodeEnvironment(), encoding: 'utf8', input }
	);

beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-permission-test-')));
	root = join(directory, 'project with spaces');
	temporaryDirectory = join(directory, 'temporary');
	runnerTemporaryDirectory = join(directory, 'runner temporary');
	githubEnv = join(directory, 'github-env');
	outside = join(directory, 'outside.txt');
	for (const path of [
		join(root, 'scripts/lib'),
		join(root, 'src/assets'),
		join(root, 'test/browser'),
		join(root, 'dist'),
		join(root, '.window-merger-index-probe'),
		join(root, 'node_modules'),
		join(temporaryDirectory, 'window-merger-chrome-hash-probe'),
		join(temporaryDirectory, 'window-merger-release-probe'),
		join(runnerTemporaryDirectory, 'window-merger-chrome-install-probe'),
	])
		await mkdir(path, { recursive: true });
	await writeFile(join(root, 'package.json'), '{"type":"module"}');
	await writeFile(join(root, 'src/assets/manifest.json'), '{}');
	await writeFile(join(root, 'test/browser/chrome-versions.json'), '{}');
	await writeFile(outside, 'untouched');
	await writeFile(githubEnv, '');
	await copyFile(new URL('../../scripts/run.ts', import.meta.url), join(root, 'scripts/run.ts'));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

const cases = [
	{ name: 'build', writes: () => [join(root, 'dist/probe')], child: true },
	{
		name: 'package',
		writes: () => [
			join(root, 'dist/probe'),
			join(root, 'dist.zip'),
			join(root, 'dist.tmp.zip'),
		],
		child: true,
	},
	{ name: 'matrix', writes: () => [], child: false },
	{
		name: 'chrome-install',
		writes: () => [
			join(runnerTemporaryDirectory, 'window-merger-chrome-install-probe/archive'),
			githubEnv,
		],
		child: true,
	},
	{
		name: 'chrome-update',
		writes: () => [
			join(root, 'test/browser/chrome-versions.json'),
			join(root, 'test/browser/chrome-checksums.json'),
			join(temporaryDirectory, 'window-merger-chrome-hash-probe/archive'),
		],
		child: true,
	},
	{ name: 'check-dependencies', writes: () => [], child: true },
	{ name: 'check-secrets', writes: () => [], child: true },
	{
		name: 'pre-commit',
		writes: () => [join(root, '.window-merger-index-probe/staged')],
		child: true,
	},
	{ name: 'pre-push', writes: () => [], child: true },
	{ name: 'version', writes: () => [join(root, 'src/assets/manifest.json')], child: true },
	{ name: 'release-check', writes: () => [], child: true },
	{
		name: 'release',
		writes: () => [join(temporaryDirectory, 'window-merger-release-probe/package.json')],
		child: true,
	},
];

it.each(cases)('enforces the permissions declared by the $name command', (test) => {
	const invocation = nodeInvocation(commands[test.name]);
	const flags = invocation.runner
		? resolvePermissionArguments(invocation.flags, context())
		: invocation.flags;
	const forbidden = [join(root, 'package.json'), join(root, 'src/protected.ts'), outside];
	const probe = `
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
const attempt = (operation) => { try { operation(); return null; } catch (error) { return error.code; } };
console.log(JSON.stringify({
  writes: ${JSON.stringify(test.writes())}.map(path => attempt(() => writeFileSync(path, 'probe'))),
  forbidden: ${JSON.stringify(forbidden)}.map(path => attempt(() => writeFileSync(path, 'probe'))),
  outsideRead: attempt(() => readFileSync(${JSON.stringify(outside)})),
  outputRoot: ${test.name === 'package' || test.name === 'build'} ? attempt(() => lstatSync(${JSON.stringify(join(root, 'dist'))})) : null,
  child: process.permission.has('child'), worker: process.permission.has('worker'),
  addons: process.permission.has('addons'), readAll: process.permission.has('fs.read'),
  writeAll: process.permission.has('fs.write'),
}));`;
	const result = spawnSync(process.execPath, [...flags, '--input-type=module', '--eval', probe], {
		cwd: root,
		env: nodeEnvironment(),
		encoding: 'utf8',
	});
	expect(result.status, result.stderr).toBe(0);
	expect(JSON.parse(result.stdout)).toEqual({
		writes: test.writes().map(() => null),
		forbidden: forbidden.map(() => 'ERR_ACCESS_DENIED'),
		outsideRead: 'ERR_ACCESS_DENIED',
		outputRoot: null,
		child: test.child,
		worker: false,
		addons: false,
		readAll: false,
		writeAll: false,
	});
});

it('declares permissions for every owned executable script at its call site', async () => {
	const entries = new Set(
		Object.values(commands).map((command) => basename(nodeInvocation(command).entry))
	);
	const files = await readdir(new URL('../../scripts/', import.meta.url));
	for (const file of files.filter((file) => file.endsWith('.ts') && file !== 'run.ts')) {
		expect(entries.has(file), file).toBe(true);
	}
});

it('anchors relative grants to the caller for tools running in a different cwd', () => {
	const flags = Object.freeze([
		'--permission',
		'--allow-fs-read=./node_modules',
		'--allow-fs-write=./output',
		'--allow-child-process',
	]);
	expect(resolvePermissionArguments(flags, context())).toEqual([
		'--permission',
		`--allow-fs-read=${join(root, 'node_modules')}`,
		`--allow-fs-write=${join(root, 'output')}`,
		'--allow-child-process',
	]);
});

it('resolves only the explicitly requested dynamic filesystem paths', () => {
	expect(
		resolvePermissionArguments(
			[
				'--permission',
				'--allow-fs-read=@tmpdir/hash-*',
				'--allow-fs-write=@runner-temp/chrome-*',
				'--allow-fs-write=@github-env',
			],
			context()
		)
	).toEqual([
		'--permission',
		`--allow-fs-read=${join(temporaryDirectory, 'hash-*')}`,
		`--allow-fs-write=${join(runnerTemporaryDirectory, 'chrome-*')}`,
		`--allow-fs-write=${githubEnv}`,
	]);
});

it('omits an unset GitHub environment file and falls back to the OS temporary directory', () => {
	expect(
		resolvePermissionArguments(
			['--allow-fs-write=@github-env', '--allow-fs-write=@runner-temp/chrome-*'],
			{
				...context(),
				environment: {},
			}
		)
	).toEqual([`--allow-fs-write=${join(temporaryDirectory, 'chrome-*')}`]);
});

it('does not reinterpret global or invalid empty grants as project directory grants', () => {
	const flags = ['--permission', '--allow-fs-read=*', '--allow-fs-write='];
	expect(resolvePermissionArguments(flags, context())).toEqual(flags);
});

it('rejects unknown dynamic paths instead of silently granting a different location', () => {
	expect(() => resolvePermissionArguments(['--allow-fs-write=@unknown'], context())).toThrow(
		'Unknown permission path: @unknown'
	);
});

it('forwards explicitly supplied grants instead of replacing them with a script-specific policy', async () => {
	const entry = join(root, 'scripts/probe.ts');
	await writeFile(
		entry,
		`import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
writeFileSync(new URL('../allowed.txt', import.meta.url), 'allowed');
const child = spawnSync(process.execPath, ['--permission', '--eval', "process.stdout.write('child')"], { encoding: 'utf8' });
console.log(JSON.stringify({ child: child.stdout, status: child.status }));`
	);
	const result = launch(
		[
			'--permission',
			'--allow-fs-read=./package.json',
			'--allow-fs-write=./allowed.txt',
			'--allow-child-process',
		],
		entry
	);
	expect(result.status, result.stderr).toBe(0);
	expect(await readFile(join(root, 'allowed.txt'), 'utf8')).toBe('allowed');
	expect(JSON.parse(result.stdout)).toEqual({ child: 'child', status: 0 });
});

it('does not add ambient or inherited grants, preloads, workers, or child processes', async () => {
	const entry = join(root, 'scripts/probe.ts');
	await writeFile(
		entry,
		`import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
const attempt = (operation) => { try { operation(); return null; } catch (error) { return error.code; } };
console.log(JSON.stringify({
  read: attempt(() => readFileSync(${JSON.stringify(outside)})),
  write: attempt(() => writeFileSync(${JSON.stringify(outside)}, 'changed')),
  child: attempt(() => spawnSync(process.execPath, ['--version'])),
  worker: attempt(() => new Worker('', { eval: true })),
  options: process.env.NODE_OPTIONS ?? null, preloaded: globalThis.permissionTestPreloaded ?? false,
}));`
	);
	const result = spawnSync(
		process.execPath,
		[
			'--permission',
			'--allow-child-process',
			join(root, 'scripts/run.ts'),
			'--permission',
			'--allow-fs-read=./package.json',
			'--',
			entry,
		],
		{
			cwd: root,
			encoding: 'utf8',
			env: {
				...nodeEnvironment(),
				NODE_OPTIONS:
					'--permission --allow-fs-read=* --allow-fs-write=* --allow-worker --import=data:text/javascript,globalThis.permissionTestPreloaded=true',
			},
		}
	);
	expect(result.status, result.stderr).toBe(0);
	expect(JSON.parse(result.stdout)).toEqual({
		read: 'ERR_ACCESS_DENIED',
		write: 'ERR_ACCESS_DENIED',
		child: 'ERR_ACCESS_DENIED',
		worker: 'ERR_ACCESS_DENIED',
		options: null,
		preloaded: false,
	});
	expect(await readFile(outside, 'utf8')).toBe('untouched');
});

it('preserves script arguments, stdin, stdout, stderr, and a nonzero exit code', async () => {
	const entry = join(root, 'scripts/probe.ts');
	await writeFile(
		entry,
		`import { readFileSync } from 'node:fs';
console.log(JSON.stringify({ args: process.argv.slice(2), input: readFileSync(0, 'utf8') }));
console.error('worker stderr'); process.exitCode = 7;`
	);
	const result = launch(
		['--permission', '--allow-fs-read=./package.json'],
		entry,
		['argument with spaces', '@github-env'],
		'push input\n'
	);
	expect(result.status, result.stderr).toBe(7);
	expect(JSON.parse(result.stdout)).toEqual({
		args: ['argument with spaces', '@github-env'],
		input: 'push input\n',
	});
	expect(result.stderr).toContain('worker stderr');
});

it.each([{ args: [] }, { args: ['--permission'] }, { args: ['--', 'scripts/probe.ts'] }])(
	'rejects an incomplete invocation: $args',
	({ args }) => {
		const runner = fileURLToPath(new URL('../../scripts/run.ts', import.meta.url));
		const result = spawnSync(
			process.execPath,
			['--permission', '--allow-child-process', runner, ...args],
			{
				cwd: root,
				env: nodeEnvironment(),
				encoding: 'utf8',
			}
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'Use explicit --permission flags, then -- <script> [arguments]'
		);
	}
);
