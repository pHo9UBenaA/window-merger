import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
	codePermissions,
	operationPolicies,
	taskPermissions,
	taskPolicies,
} from '../../scripts/runtime/policy';

let directory: string;
let root: string;
let code: string;
const environment = () => {
	const { NODE_OPTIONS: _options, ...env } = process.env;
	return env;
};

beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-permission-test-')));
	root = join(directory, 'project with spaces');
	code = join(directory, 'runner');
	await mkdir(join(root, 'src/assets'), { recursive: true });
	await mkdir(code);
	await writeFile(join(root, 'package.json'), '{"type":"module","version":"1.4.10"}');
	await writeFile(join(root, 'src/assets/manifest.json'), '{"version":"1.4.10"}');
	await writeFile(join(code, 'package.json'), '{"type":"module"}');
	await cp(new URL('../../scripts', import.meta.url), join(code, 'scripts'), { recursive: true });
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

const probe = `
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
const attempt = operation => { try { operation(); return null; } catch (error) { return error.code; } };
console.log(JSON.stringify({
  write: attempt(() => writeFileSync('package.json', 'changed')),
  child: attempt(() => spawnSync(process.execPath, ['--version'])),
  worker: attempt(() => new Worker('', { eval: true })),
  writeAll: process.permission.has('fs.write'),
  addons: process.permission.has('addons'),
  options: process.env.NODE_OPTIONS ?? null,
  preloaded: globalThis.permissionTestPreloaded ?? false,
}));`;

it.each(Object.keys(taskPolicies('/project')))(
	'denies direct writes and process creation in the %s task',
	(name) => {
		const policy = taskPolicies(root)[name];
		const result = spawnSync(
			process.execPath,
			[...taskPermissions(root, policy), '--input-type=module', '--eval', probe],
			{
				cwd: root,
				env: environment(),
				encoding: 'utf8',
			}
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			write: 'ERR_ACCESS_DENIED',
			child: 'ERR_ACCESS_DENIED',
			worker: 'ERR_ACCESS_DENIED',
			writeAll: false,
			addons: false,
			options: null,
			preloaded: false,
		});
	}
);

const launch = (task: string, args: string[] = [], input?: string, env = environment()) =>
	spawnSync(
		process.execPath,
		[
			'--permission',
			`--allow-fs-read=${join(code, 'package.json')}`,
			`--allow-fs-read=${join(code, 'scripts/runtime')}`,
			'--allow-child-process',
			join(code, 'scripts/run.ts'),
			'--root',
			root,
			task,
			...args,
		],
		{ env, encoding: 'utf8', input, timeout: 15_000 }
	);

it('drops inherited grants and preloads before starting a task', async () => {
	await writeFile(join(code, 'scripts/tasks/build.ts'), probe);
	const result = launch('build', [], undefined, {
		...environment(),
		NODE_OPTIONS:
			'--permission --allow-fs-read=* --allow-fs-write=* --allow-child-process --import=data:text/javascript,globalThis.permissionTestPreloaded=true',
	});
	expect(result.status, result.stderr).toBe(0);
	expect(JSON.parse(result.stdout)).toMatchObject({
		write: 'ERR_ACCESS_DENIED',
		child: 'ERR_ACCESS_DENIED',
		preloaded: false,
		options: null,
	});
});

it('forwards arguments, standard streams and the task exit code', async () => {
	await writeFile(
		join(code, 'scripts/tasks/build.ts'),
		`
import { readFileSync } from 'node:fs';
console.log(JSON.stringify({ args: process.argv.slice(2), input: readFileSync(0, 'utf8') }));
console.error('task stderr'); process.exitCode = 7;`
	);
	const result = launch('build', ['argument with spaces'], 'push input\n');
	expect(result.status, result.stderr).toBe(7);
	expect(JSON.parse(result.stdout)).toEqual({
		args: ['argument with spaces'],
		input: 'push input\n',
	});
	expect(result.stderr).toContain('task stderr');
});

it('allows only the task’s named operations, not arbitrary scripts or commands', async () => {
	await writeFile(
		join(code, 'scripts/tasks/build.ts'),
		`
import { callOperation } from '../runtime/client.ts';
const errors = [];
for (const operation of ['write-manifest', '../tasks/release', 'exec']) {
  try { callOperation(operation, { executable: 'sh', args: ['-c', 'exit 0'] }); }
  catch (error) { errors.push(error.message); }
}
console.log(JSON.stringify(errors));`
	);
	const result = launch('build');
	expect(result.status, result.stderr).toBe(0);
	expect(JSON.parse(result.stdout)).toEqual([
		'Operation not permitted: write-manifest',
		'Operation not permitted: ../tasks/release',
		'Operation not permitted: exec',
	]);
});

it('validates asset destinations before writing and keeps source files untouched', async () => {
	await writeFile(
		join(code, 'scripts/tasks/build.ts'),
		`
import { callOperation } from '../runtime/client.ts';
callOperation('build-assets', { action: 'reset' });
callOperation('build-assets', { action: 'sync', files: [{ name: 'nested/output.txt', data: Buffer.from('allowed').toString('base64') }], removed: [] });
try { callOperation('build-assets', { action: 'sync', files: [{ name: '../package.json', data: '' }], removed: [] }); }
catch (error) { console.log(error.message); }`
	);
	const result = launch('build');
	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toContain('Path must stay inside its directory');
	expect(await readFile(join(root, 'dist/nested/output.txt'), 'utf8')).toBe('allowed');
	expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version).toBe('1.4.10');
});

it.each([
	'write-manifest',
	'snapshot',
	'release-directory',
	'chrome-download',
	'chrome-lock',
	'chrome-environment',
	'build-assets',
])('does not grant child processes to the %s writer', (name) => {
	const operation = operationPolicies(root)[name];
	expect(operation.flags).not.toContain('--allow-child-process');
	const result = spawnSync(
		process.execPath,
		[...codePermissions, ...operation.flags, '--input-type=module', '--eval', probe],
		{
			cwd: root,
			env: environment(),
			encoding: 'utf8',
		}
	);
	expect(result.status, result.stderr).toBe(0);
	expect(JSON.parse(result.stdout)).toMatchObject({
		write: 'ERR_ACCESS_DENIED',
		child: 'ERR_ACCESS_DENIED',
	});
});

it('declares a permission policy for every task and operation entry point', async () => {
	const tasks = (await readdir(new URL('../../scripts/tasks', import.meta.url))).map((name) =>
		name.replace(/\.ts$/, '')
	);
	const operations = (await readdir(new URL('../../scripts/operations', import.meta.url))).map(
		(name) => name.replace(/\.ts$/, '')
	);
	expect(Object.keys(taskPolicies(root)).toSorted()).toEqual(tasks.toSorted());
	expect(Object.keys(operationPolicies(root)).toSorted()).toEqual(operations.toSorted());
});

it('rejects unallocated temporary paths at the process boundary', async () => {
	await writeFile(
		join(code, 'scripts/tasks/pre-commit.ts'),
		`
import { callOperation } from '../runtime/client.ts';
try { callOperation('snapshot', { action: 'remove', directory: ${JSON.stringify(join(root, '.window-merger-index-unowned'))} }); }
catch (error) { console.log(error.message); }
const directory = callOperation('snapshot', { action: 'create' });
callOperation('snapshot', { action: 'remove', directory });`
	);
	const result = launch('pre-commit');
	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toContain('does not belong to this task');
	expect(
		(await readdir(root)).filter((name) => name.startsWith('.window-merger-index-'))
	).toEqual([]);
});

it('forwards termination to a long-running task and waits for its cleanup', async () => {
	await writeFile(
		join(code, 'scripts/tasks/build.ts'),
		`
const timeout = setTimeout(() => process.exit(2), 5000);
process.on('SIGTERM', () => { clearTimeout(timeout); console.log('cleaned up'); });
console.log('ready');`
	);
	const runner = spawn(
		process.execPath,
		[join(code, 'scripts/run.ts'), '--root', root, 'build'],
		{
			env: environment(),
			stdio: ['ignore', 'pipe', 'pipe'],
		}
	);
	let output = '';
	let errors = '';
	runner.stdout.on('data', (chunk) => {
		output += chunk;
	});
	runner.stderr.on('data', (chunk) => {
		errors += chunk;
	});
	const completion = new Promise<number | null>((fulfill, reject) => {
		runner.on('error', reject);
		runner.on('close', fulfill);
	});
	try {
		await new Promise<void>((fulfill) => {
			runner.stdout.once('data', () => fulfill());
		});
		runner.kill('SIGTERM');
		expect(await completion, errors).toBe(0);
		expect(output).toContain('cleaned up');
	} finally {
		runner.kill('SIGKILL');
	}
});

it('rejects unknown task names and caller-supplied permission flags', () => {
	for (const task of ['../operations/archive', '--allow-fs-write=*', 'unknown']) {
		const result = launch(task);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Unknown task');
	}
});
