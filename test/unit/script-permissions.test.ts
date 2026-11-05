import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildMainCommand, writeAssetsCommand } from '../../scripts/build/commands.generated';
import { chromeUpdateCommand } from '../../scripts/chrome-update/commands.generated';
import { runNode } from '../../scripts/lib/run-node';
import { fixtureEnvironment as environment } from '../helpers/fixture-command';

let directory: string;
let root: string;
beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-permission-test-')));
	root = join(directory, 'project with spaces');
	for (const path of ['src/assets', 'test/browser', 'dist'])
		await mkdir(join(root, path), { recursive: true });
	await writeFile(join(root, 'package.json'), '{"type":"module","version":"1.5.0"}');
	await writeFile(join(root, 'src/assets/manifest.json'), '{"version":"1.4.10"}');
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(directory, { recursive: true, force: true });
});

it('writes only approved assets without inheriting Node options', async () => {
	const launch = (input: unknown) =>
		spawnSync(process.execPath, writeAssetsCommand(root), {
			cwd: root,
			env: environment(),
			encoding: 'utf8',
			input: JSON.stringify(input),
		});
	vi.stubEnv(
		'NODE_OPTIONS',
		'--permission --allow-fs-read=* --allow-fs-write=* --allow-child-process --import=data:text/javascript,process.exit(19)'
	);
	runNode(
		writeAssetsCommand(root),
		{
			action: 'sync',
			files: [{ name: 'nested/output.txt', data: Buffer.from('allowed').toString('base64') }],
			removed: [],
		},
		root
	);
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

it('hashes Chrome streams with only lock-file writes and no subprocess permissions', async () => {
	const args = chromeUpdateCommand(root);
	expect(args.filter((argument) => argument.startsWith('--allow-fs-write='))).toEqual([
		`--allow-fs-write=${join(root, 'test/browser/chrome-checksums.json')}`,
		`--allow-fs-write=${join(root, 'test/browser/chrome-versions.json')}`,
	]);
	expect(args).toContain('--no-allow-child-process');
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
		JSON.parse(await readFile(join(root, 'test/browser/chrome-versions.json'), 'utf8'))
	).toEqual({ '120': version });
});

it('watches optimized assets and source through the CLI and stops cleanly', async () => {
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
	const expectFile = async (name: string, content: string) =>
		vi.waitFor(
			async () =>
				expect(await readFile(join(root, 'dist', name), 'utf8'), errors).toBe(content),
			{ timeout: 5000 }
		);
	try {
		await vi.waitFor(() => expect(output, errors).toContain('Watching source and assets'), {
			timeout: 15000,
		});
		const manifest = '{ "minimum_chrome_version": "120", "description": "changed" }\n';
		await writeFile(join(root, 'src/assets/manifest.json'), manifest);
		await expectFile(
			'manifest.json',
			'{"minimum_chrome_version":"120","description":"changed"}'
		);
		await mkdir(join(root, 'src/assets/nested'));
		const asset = join(root, 'src/assets/nested/example.txt');
		await writeFile(asset, 'added');
		await expectFile('nested/example.txt', 'added');
		await writeFile(asset, 'changed');
		await expectFile('nested/example.txt', 'changed');
		await rm(join(root, 'src/assets/nested'), { recursive: true });
		await vi.waitFor(
			async () =>
				expect(readFile(join(root, 'dist/nested/example.txt'))).rejects.toMatchObject({
					code: 'ENOENT',
				}),
			{ timeout: 5000 }
		);
		await writeFile(join(root, 'src/background.ts'), 'console.log("source changed");');
		await vi.waitFor(
			async () =>
				expect(await readFile(join(root, 'dist/background.js'), 'utf8')).toContain(
					'source changed'
				),
			{ timeout: 5000 }
		);
		expect(await readFile(join(root, 'src/assets/manifest.json'), 'utf8')).toBe(manifest);
		build.kill('SIGTERM');
		expect(await completion, errors).toBe(0);
	} finally {
		build.kill('SIGKILL');
		await completion;
	}
}, 45_000);

it('does not stage or change the manifest when the version pipeline reader fails', async () => {
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
