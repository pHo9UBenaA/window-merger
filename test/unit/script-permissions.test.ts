import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	buildMainCommand,
	prepareAssetsCommand,
	writeAssetsCommand,
} from '../../scripts/build/commands.generated';
import { checkDependenciesCommand } from '../../scripts/check-dependencies/commands.generated';
import { checkSecretsCommand } from '../../scripts/check-secrets/commands.generated';
import {
	chromeEnvironmentCommand,
	readChromeInstallationCommand,
} from '../../scripts/chrome-install/commands.generated';
import { chromeMatrixCommand } from '../../scripts/chrome-matrix/commands.generated';
import {
	chromeUpdateCommand,
	readChromeUpdateCommand,
	writeChromeLockCommand,
} from '../../scripts/chrome-update/commands.generated';
import {
	clearArchiveCommand,
	validatePackageCommand,
} from '../../scripts/package/commands.generated';
import {
	inspectReleaseCommand,
	validateVersionsCommand,
} from '../../scripts/release/commands.generated';
import {
	readVersionCommand,
	writeVersionCommand,
} from '../../scripts/sync-version/commands.generated';

let directory: string;
let root: string;
const environment = () => {
	const { NODE_OPTIONS: _options, ...env } = process.env;
	return env;
};
beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-permission-test-')));
	root = join(directory, 'project with spaces');
	for (const path of ['src/assets', 'test/browser', 'dist'])
		await mkdir(join(root, path), { recursive: true });
	await writeFile(join(root, 'package.json'), '{"type":"module","version":"1.5.0"}');
	await writeFile(join(root, 'src/assets/manifest.json'), '{"version":"1.4.10"}');
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

const probe = `
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
const attempt = operation => { try { operation(); return null; } catch (error) { return error.code; } };
console.log(JSON.stringify({
  write: attempt(() => writeFileSync('package.json', 'changed')),
  child: attempt(() => spawnSync(process.execPath, ['--version'])),
  worker: attempt(() => new Worker('', { eval: true })),
  writeAll: process.permission.has('fs.write'), readAll: process.permission.has('fs.read'),
  addons: process.permission.has('addons'),
}));`;
const readers = [
	prepareAssetsCommand,
	checkDependenciesCommand,
	checkSecretsCommand,
	readChromeInstallationCommand,
	readChromeUpdateCommand,
	chromeMatrixCommand,
	readVersionCommand,
	validateVersionsCommand,
	inspectReleaseCommand,
	validatePackageCommand,
];
it.each(readers.map((command) => ({ name: command.name, command })))(
	'keeps $name free of writes, workers and subprocesses',
	({ command }) => {
		const args = command(root).slice(0, -1);
		const result = spawnSync(
			process.execPath,
			[...args, '--input-type=module', '--eval', probe],
			{ cwd: root, env: environment(), encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			write: 'ERR_ACCESS_DENIED',
			child: 'ERR_ACCESS_DENIED',
			worker: 'ERR_ACCESS_DENIED',
			writeAll: false,
			readAll: false,
			addons: false,
		});
	}
);

it.each(
	[
		writeAssetsCommand,
		writeVersionCommand,
		writeChromeLockCommand,
		chromeEnvironmentCommand,
		clearArchiveCommand,
		chromeUpdateCommand,
	].map((command) => ({ name: command.name, command }))
)('does not give $name subprocess or unrelated-file permissions', ({ command }) => {
	const result = spawnSync(
		process.execPath,
		[...command(root).slice(0, -1), '--input-type=module', '--eval', probe],
		{ cwd: root, env: environment(), encoding: 'utf8' }
	);
	expect(result.status, result.stderr).toBe(0);
	expect(JSON.parse(result.stdout)).toMatchObject({
		write: 'ERR_ACCESS_DENIED',
		child: 'ERR_ACCESS_DENIED',
		worker: 'ERR_ACCESS_DENIED',
		writeAll: false,
	});
});

it('writes only approved asset destinations through the directly executed writer', async () => {
	const launch = (input: unknown) =>
		spawnSync(process.execPath, writeAssetsCommand(root), {
			cwd: root,
			env: environment(),
			encoding: 'utf8',
			input: JSON.stringify(input),
		});
	const allowed = launch({
		action: 'sync',
		files: [{ name: 'nested/output.txt', data: Buffer.from('allowed').toString('base64') }],
		removed: [],
	});
	expect(allowed.status, allowed.stderr).toBe(0);
	expect(await readFile(join(root, 'dist/nested/output.txt'), 'utf8')).toBe('allowed');
	const rejected = launch({
		action: 'sync',
		files: [{ name: '../package.json', data: '' }],
		removed: [],
	});
	expect(rejected.status).toBe(1);
	expect(rejected.stderr).toContain('Path must stay inside its directory');
	expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version).toBe('1.5.0');
});

it('applies a complete Chrome update plan without subprocess permissions', async () => {
	const versions = { '120': '120.0.6099.109' };
	const checksums = { '120.0.6099.109': { linux64: 'a'.repeat(64) } };
	const result = spawnSync(process.execPath, chromeUpdateCommand(root), {
		cwd: root,
		env: environment(),
		encoding: 'utf8',
		input: JSON.stringify({ versions, checksums, downloads: [] }),
	});
	expect(result.status, result.stderr).toBe(0);
	expect(
		JSON.parse(await readFile(join(root, 'test/browser/chrome-versions.json'), 'utf8'))
	).toEqual(versions);
	expect(
		JSON.parse(await readFile(join(root, 'test/browser/chrome-checksums.json'), 'utf8'))
	).toEqual(checksums);
	expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version).toBe('1.5.0');
});

it('collects Chrome hashes within the declared project-local write grant', async () => {
	const args = chromeUpdateCommand(root);
	const prelude = `globalThis.fetch = async () => new Response('archive fixture');`;
	const version = '120.0.6099.109';
	const result = spawnSync(
		process.execPath,
		[
			...args.slice(0, -1),
			`--import=data:text/javascript,${encodeURIComponent(prelude)}`,
			...args.slice(-1),
		],
		{
			cwd: root,
			env: environment(),
			encoding: 'utf8',
			input: JSON.stringify({
				versions: { '120': version },
				checksums: {},
				downloads: [{ version, platform: 'linux64' }],
			}),
		}
	);
	expect(result.status, result.stderr).toBe(0);
	const sha256 = createHash('sha256').update('archive fixture').digest('hex');
	expect(
		JSON.parse(await readFile(join(root, 'test/browser/chrome-checksums.json'), 'utf8'))
	).toEqual({ [version]: { linux64: sha256 } });
	expect(
		(await readdir(root)).filter((name) => name.startsWith('.window-merger-chrome-hash-'))
	).toEqual([]);
});

it('builds a relative target directory without changing the caller’s working directory', async () => {
	await writeFile(join(root, 'LICENSE'), 'license');
	await writeFile(join(root, 'src/background.ts'), 'console.log("relative root fixture");');
	await writeFile(join(root, 'src/assets/manifest.json'), '{"minimum_chrome_version":"120"}');
	const entry = new URL('../../scripts/build/main.ts', import.meta.url).href;
	const program = `import { buildExtension } from ${JSON.stringify(entry)}; await buildExtension({ root: process.argv[1] });`;
	const result = spawnSync(
		process.execPath,
		['--input-type=module', '--eval', program, relative(directory, root)],
		{ cwd: directory, env: environment(), encoding: 'utf8' }
	);
	expect(result.status, result.stderr).toBe(0);
	expect(await readFile(join(root, 'dist/background.js'), 'utf8')).toContain(
		'relative root fixture'
	);
});

it('watches assets through the directly executed build script and stops cleanly', async () => {
	await writeFile(join(root, 'LICENSE'), 'license');
	await writeFile(join(root, 'src/background.ts'), 'console.log("watch fixture");');
	await writeFile(join(root, 'src/assets/manifest.json'), '{"minimum_chrome_version":"120"}');
	const build = spawn(process.execPath, [...buildMainCommand(root), '--watch'], {
		cwd: root,
		env: environment(),
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	let errors = '';
	build.stdout.on('data', (chunk) => {
		output += chunk;
	});
	build.stderr.on('data', (chunk) => {
		errors += chunk;
	});
	const completion = new Promise<number | null>((fulfill, reject) => {
		build.on('error', reject);
		build.on('close', fulfill);
	});
	try {
		await vi.waitFor(() => expect(output, errors).toContain('Watching source and assets'), {
			timeout: 5000,
		});
		await writeFile(join(root, 'src/assets/example.txt'), 'changed asset');
		await vi.waitFor(
			async () =>
				expect(await readFile(join(root, 'dist/example.txt'), 'utf8')).toBe(
					'changed asset'
				),
			{ timeout: 5000 }
		);
		build.kill('SIGTERM');
		expect(await completion, errors).toBe(0);
	} finally {
		build.kill('SIGKILL');
		await completion;
	}
});

it('does not stage or change the manifest when the version pipeline’s reader fails', async () => {
	const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
	await cp(new URL('../../scripts', import.meta.url), join(root, 'scripts'), { recursive: true });
	await writeFile(
		join(root, 'package.json'),
		JSON.stringify({
			name: 'version-fixture',
			type: 'module',
			version: 'invalid',
			packageManager: pkg.packageManager,
			scripts: { version: pkg.scripts.version },
		})
	);
	const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init');
	const result = spawnSync('pnpm', ['--config.verifyDepsBeforeRun=false', 'run', 'version'], {
		cwd: root,
		env: environment(),
		encoding: 'utf8',
	});
	expect(result.status).not.toBe(0);
	expect(await readFile(join(root, 'src/assets/manifest.json'), 'utf8')).toBe(
		'{"version":"1.4.10"}'
	);
	expect(git('diff', '--cached', '--name-only').stdout).toBe('');
});
