import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parseConfig, shellCommand } from '../../scripts/generate-commands';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { fixtureCommand } from '../helpers/fixture-command';

const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const config = parseConfig(
	JSON.parse(await readFile(new URL('../../scripts/commands.json', import.meta.url), 'utf8'))
);
let root: string;
const environment = () => {
	const { NODE_OPTIONS: _options, ...env } = process.env;
	return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('GIT_')));
};
const run = (command: string, env = environment(), input?: string) => {
	const result = spawnSync(fixtureCommand(command), {
		cwd: root,
		env,
		shell: true,
		input,
		encoding: 'utf8',
		timeout: 20_000,
	});
	expect(result.error, result.stderr).toBeUndefined();
	expect(result.signal, result.stderr).toBeNull();
	return result;
};
const git = (...args: string[]) => {
	const result = spawnSync('git', args, { cwd: root, env: environment(), encoding: 'utf8' });
	expect(result.status, result.stderr).toBe(0);
};

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-pipeline with spaces-')));
	await writeFile(join(root, 'package.json'), '{"type":"module"}');
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const prepareExtension = async () => {
	await cp(join(PROJECT_ROOT, 'src'), join(root, 'src'), { recursive: true });
	await cp(join(PROJECT_ROOT, 'LICENSE'), join(root, 'LICENSE'));
	await writeFile(join(root, 'dist.zip'), 'old archive');
	await writeFile(join(root, 'dist.tmp.zip'), 'interrupted archive');
};
const expectNoArchives = async () => {
	for (const name of ['dist.zip', 'dist.tmp.zip'])
		await expect(readFile(join(root, name))).rejects.toMatchObject({ code: 'ENOENT' });
};

it('packages the extension through the generated sequence without a package runner', async () => {
	await prepareExtension();
	const result = run(pkg.scripts.zip);
	expect(result.status, result.stderr).toBe(0);
	const archive = spawnSync('unzip', ['-Z1', join(root, 'dist.zip')], { encoding: 'utf8' });
	expect(archive.status, archive.stderr).toBe(0);
	expect(archive.stdout.split('\n')).toEqual(
		expect.arrayContaining(['manifest.json', 'background.js', 'LICENSE'])
	);
	await expect(readFile(join(root, 'dist.tmp.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('removes old archives and stops before packaging when compilation fails', async () => {
	await prepareExtension();
	await writeFile(join(root, 'src/background.ts'), 'invalid { syntax');
	const result = run(pkg.scripts.zip);
	expect(result.status).not.toBe(0);
	await expectNoArchives();
});

it('does not create an archive after validation fails', async () => {
	await prepareExtension();
	await rm(join(root, 'src/assets/icon-128.png'));
	const result = run(pkg.scripts.zip);
	expect(result.status).not.toBe(0);
	await expectNoArchives();
});

it.skipIf(process.platform === 'win32')(
	'removes partial output when the zip command fails',
	async () => {
		await prepareExtension();
		const bin = join(root, 'bin');
		await mkdir(bin);
		await writeFile(
			join(bin, 'zip'),
			'#!/bin/sh\nfor arg do\n case "$arg" in *.tmp.zip) printf partial > "$arg";; esac\ndone\nexit 1\n',
			{ mode: 0o755 }
		);
		const result = run(pkg.scripts.zip, {
			...environment(),
			PATH: `${bin}:${process.env.PATH}`,
		});
		expect(result.status).not.toBe(0);
		await expectNoArchives();
	}
);

it('does not hide a failed Git producer behind an empty tracked-file list', () => {
	const result = run(pkg.scripts['check:secrets']);
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('not a git repository');
});

it('does not scan untracked files or load lint configuration in an empty repository', async () => {
	git('init');
	await writeFile(join(root, '.secretlintrc.json'), 'invalid configuration');
	await writeFile(join(root, 'untracked.txt'), 'not included');
	const result = run(pkg.scripts['check:secrets']);
	expect(result.status, result.stderr).toBe(0);
});

it('passes tracked filenames to the checker without shell splitting', async () => {
	git('init');
	await symlink(join(PROJECT_ROOT, 'node_modules'), join(root, 'node_modules'), 'junction');
	await cp(join(PROJECT_ROOT, '.secretlintrc.json'), join(root, '.secretlintrc.json'));
	const files = [
		process.platform === 'win32'
			? 'file [with spaces].md'
			: 'file [with spaces]\nand newline.md',
		'--leading-dash.md',
	];
	for (const file of files) await writeFile(join(root, file), '# Safe fixture\n');
	git('add', '--', ...files);
	const result = run(pkg.scripts['check:secrets']);
	expect(result.status, result.stderr).toBe(0);
});

it('propagates a checker failure after a successful tracked-file producer', async () => {
	git('init');
	await symlink(join(PROJECT_ROOT, 'node_modules'), join(root, 'node_modules'), 'junction');
	await writeFile(join(root, '.secretlintrc.json'), 'invalid configuration');
	await writeFile(join(root, 'tracked.md'), '# Safe fixture\n');
	git('add', 'tracked.md');
	const result = run(pkg.scripts['check:secrets']);
	expect(result.status).not.toBe(0);
});

it.each([
	'',
	'refs/heads/main deadbeef refs/heads/main deadbeef',
	'(delete) 00000000 refs/tags/v1.4.9 deadbeef',
])('accepts pushes without release checks even outside a Git repository: %j', (input) => {
	const result = run(pkg.scripts['hook:pre-push'], environment(), input);
	expect(result.status, result.stderr).toBe(0);
});

it('does not accept an empty release-check result as a successful CI check', () => {
	const reader = shellCommand(config.executables.gitRead);
	const checker = shellCommand(config.executables.releaseCheck);
	const result = run(
		`node --permission --eval "console.log('[]')" | ${reader} --version-checks | ${checker}`
	);
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('Expected at least one committed version check');
});

it('does not hide a failed Git read in the release-check pipeline', () => {
	const result = run(pkg.scripts['release:check'], {
		...environment(),
		RELEASE_BRANCH: 'release/v1.4.10',
		RELEASE_COMMIT: 'HEAD',
	});
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('not a git repository');
});

it('checks package and manifest consistency on an ordinary CI branch', async () => {
	await mkdir(join(root, 'src/assets'), { recursive: true });
	await writeFile(join(root, 'package.json'), '{"version":"1.4.9"}');
	await writeFile(join(root, 'src/assets/manifest.json'), '{"version":"1.4.10"}');
	git('init');
	git('config', 'user.name', 'Version Test');
	git('config', 'user.email', 'test@example.invalid');
	git('add', '.');
	git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: inconsistent versions');
	const result = run(pkg.scripts['release:check'], {
		...environment(),
		RELEASE_BRANCH: 'feature/example',
		RELEASE_COMMIT: 'HEAD',
	});
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('does not match manifest version');
});

it('keeps both Chrome locks unchanged when an upstream producer fails', async () => {
	await mkdir(join(root, 'test/browser'), { recursive: true });
	for (const file of ['chrome-versions.json', 'chrome-checksums.json'])
		await writeFile(join(root, 'test/browser', file), 'unchanged');
	const writer = shellCommand(config.executables.chromeUpdate);
	const result = run(`node --permission --eval "process.exit(1)" | ${writer}`);
	expect(result.status).not.toBe(0);
	for (const file of ['chrome-versions.json', 'chrome-checksums.json'])
		expect(await readFile(join(root, 'test/browser', file), 'utf8')).toBe('unchanged');
});
