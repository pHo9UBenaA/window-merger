import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parseConfig, shellCommand } from '../../scripts/generate-commands';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { fixtureEnvironment as environment, fixtureCommand } from '../helpers/fixture-command';

const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const config = parseConfig(
	JSON.parse(await readFile(new URL('../../scripts/commands.json', import.meta.url), 'utf8'))
);
let root: string;
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
	await mkdir(join(root, 'dist'), { recursive: true });
	await writeFile(join(root, 'dist/obsolete.txt'), 'removed source asset');
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
	const files = archive.stdout.split('\n');
	expect(files).toEqual(expect.arrayContaining(['manifest.json', 'background.js', 'LICENSE']));
	expect(files).not.toContain('obsolete.txt');
	await expect(readFile(join(root, 'dist.tmp.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
}, 20_000);

it('removes old archives and stops before packaging when compilation fails', async () => {
	await prepareExtension();
	await writeFile(join(root, 'src/background.ts'), 'invalid { syntax');
	const result = run(pkg.scripts.zip);
	expect(result.status).not.toBe(0);
	await expectNoArchives();
}, 20_000);

it('does not create an archive after validation fails', async () => {
	await prepareExtension();
	await rm(join(root, 'src/assets/icon-128.png'));
	const result = run(pkg.scripts.zip);
	expect(result.status).not.toBe(0);
	await expectNoArchives();
}, 20_000);

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

it('checks only tracked paths, preserves filenames and propagates checker errors', async () => {
	git('init');
	await writeFile(join(root, '.secretlintrc.json'), 'invalid configuration');
	await writeFile(join(root, 'untracked.txt'), 'not included');
	const empty = run(pkg.scripts['check:secrets']);
	expect(empty.status, empty.stderr).toBe(0);
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
	await writeFile(join(root, '.secretlintrc.json'), 'invalid configuration');
	expect(run(pkg.scripts['check:secrets']).status).not.toBe(0);
});

it('accepts a push without release refs even outside a Git repository', () => {
	const result = run(
		pkg.scripts['hook:pre-push'],
		environment(),
		'refs/heads/main deadbeef refs/heads/main deadbeef'
	);
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

it('checks committed manifests on ordinary CI branches and enforces release branch versions', async () => {
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
	await writeFile(join(root, 'package.json'), '{"version":"1.4.10"}');
	git('add', '.');
	git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: consistent versions');
	const release = run(pkg.scripts['release:check'], {
		...environment(),
		RELEASE_BRANCH: 'release/v1.4.9',
		RELEASE_COMMIT: 'HEAD',
	});
	expect(release.status).not.toBe(0);
	expect(release.stderr).toContain('does not match package version');
});
