import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReleaseTag } from '../../scripts/release/main';
import { useOperationRoot } from '../helpers/script-operations';

vi.mock('../../scripts/lib/run-node', async () => ({
	runNode: (await import('../helpers/script-operations')).runScript,
}));

it('skips non-release branches without accessing a repository', () => {
	expect(createReleaseTag('feature/example', 'HEAD', '/nonexistent/window-merger')).toBe(
		'skipped'
	);
});

describe('release Git integration', { timeout: 30_000 }, () => {
	let directory: string;
	let repository: string;
	let remote: string;
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: repository,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	const remoteGit = (...args: string[]) =>
		execFileSync('git', ['--git-dir', remote, ...args], { encoding: 'utf8' }).trim();
	const commit = async (version: string) => {
		const { packageManager, scripts } = JSON.parse(
			await readFile(new URL('../../package.json', import.meta.url), 'utf8')
		);
		await writeFile(
			join(repository, 'package.json'),
			JSON.stringify({
				name: 'release-fixture',
				version,
				private: true,
				type: 'module',
				packageManager,
				scripts: {
					version: scripts.version,
					'release:publish': scripts['release:publish'],
					'release:check': scripts['release:check'],
				},
			})
		);
		await writeFile(
			join(repository, 'src/assets/manifest.json'),
			JSON.stringify({
				manifest_version: 3,
				name: 'Release fixture',
				version,
			})
		);
		execFileSync('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile'], {
			cwd: repository,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		git('add', '.');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', `chore: release ${version}`);
		return git('rev-parse', 'HEAD');
	};
	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), 'window-merger-tag-test-'));
		repository = join(directory, 'repository');
		remote = join(directory, 'remote.git');
		await mkdir(join(repository, 'src/assets'), { recursive: true });
		await cp(new URL('../../scripts', import.meta.url), join(repository, 'scripts'), {
			recursive: true,
		});
		await writeFile(
			join(repository, 'pnpm-workspace.yaml'),
			'tagVersionPrefix: v\npmOnFail: error\n'
		);
		await copyFile(new URL('../../.npmrc', import.meta.url), join(repository, '.npmrc'));
		git('init', '-b', 'main');
		git('config', 'user.name', 'Release Test');
		git('config', 'user.email', 'test@example.invalid');
		git('init', '--bare', remote);
		git('remote', 'add', 'origin', remote);
		useOperationRoot(repository);
	});
	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it('rejects CLI arguments rather than publishing during an attempted check', async () => {
		const sha = await commit('1.4.10');
		const script = fileURLToPath(new URL('../../scripts/release/main.ts', import.meta.url));
		expect(() =>
			execFileSync(process.execPath, [script, '--check-push'], {
				cwd: repository,
				env: { ...process.env, RELEASE_BRANCH: 'release/v1.4.10', RELEASE_COMMIT: sha },
				stdio: ['ignore', 'pipe', 'pipe'],
			})
		).toThrow('Use pnpm release:check');
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
	});

	it('uses the real pnpm version command to prepare both manifests without a local tag', async () => {
		const sha = await commit('1.4.10');
		execFileSync('pnpm', ['version', '1.4.11', '--no-git-tag-version'], {
			cwd: repository,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		expect(JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')).version).toBe(
			'1.4.11'
		);
		expect(
			JSON.parse(await readFile(join(repository, 'src/assets/manifest.json'), 'utf8'))
		).toEqual({
			manifest_version: 3,
			name: 'Release fixture',
			version: '1.4.11',
		});
		expect(git('diff', '--cached', '--name-only')).toBe('src/assets/manifest.json');
		expect(git('tag', '--list')).toBe('');
		expect(git('rev-parse', 'HEAD')).toBe(sha);
	});

	it('publishes the approved snapshot through the workflow command and safely reruns without changing the caller', async () => {
		const prefix = 'release-%s-';
		await writeFile(
			join(repository, 'pnpm-workspace.yaml'),
			`tagVersionPrefix: ${JSON.stringify(prefix)}\npmOnFail: error\n`
		);
		const sha = await commit('1.4.10');
		const current = await commit('1.4.11');
		const tag = 'release-%s-1.4.10';
		git('tag', tag, current);
		const workflow = await readFile(
			new URL('../../.github/workflows/create-tag-on-merge.yml', import.meta.url),
			'utf8'
		);
		const command = workflow
			.replace(/\\\r?\n\s*/g, ' ')
			.match(/pnpm --silent --config\.verifyDepsBeforeRun=false run release:publish/);
		if (!command) throw new Error('Missing release workflow command');
		const [executable, ...args] = command[0].trim().split(/\s+/);
		const env: NodeJS.ProcessEnv = {
			...process.env,
			RELEASE_BRANCH: 'release/v1.4.10',
			RELEASE_COMMIT: sha,
			GIT_DIR: join(repository, '.git'),
			GIT_WORK_TREE: repository,
			GIT_INDEX_FILE: join(repository, '.git/index'),
		};
		delete env.npm_execpath;
		const publish = () =>
			execFileSync(executable, args, {
				cwd: repository,
				env,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			}).trim();
		expect(publish()).toBe('created');
		const marker = remoteGit('rev-parse', `refs/tags/${tag}^{commit}`);
		expect(marker).not.toBe(sha);
		expect(remoteGit('cat-file', '-t', `refs/tags/${tag}`)).toBe('tag');
		expect(remoteGit('rev-parse', `${marker}^`)).toBe(sha);
		expect(remoteGit('rev-parse', `${marker}^{tree}`)).toBe(git('rev-parse', `${sha}^{tree}`));
		expect(publish()).toBe('existing');
		expect(remoteGit('rev-parse', `refs/tags/${tag}^{commit}`)).toBe(marker);
		expect(git('rev-parse', 'HEAD')).toBe(current);
		expect(git('status', '--porcelain')).toBe('');
		expect(git('ls-remote', '--heads', 'origin')).toBe('');
		expect(git('tag', '--list')).toBe(tag);
		expect(git('rev-parse', tag)).toBe(current);
		await expect(readFile(join(repository, 'node_modules'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('does not publish a version hook’s changes beyond the approved snapshot', async () => {
		await commit('1.4.10');
		const pkg = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
		pkg.scripts.version +=
			' && node --permission --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/unexpected.mjs';
		await writeFile(join(repository, 'package.json'), JSON.stringify(pkg));
		await writeFile(
			join(repository, 'scripts/unexpected.mjs'),
			"import { writeFileSync } from 'node:fs';\n" +
				"import { execFileSync } from 'node:child_process';\n" +
				"writeFileSync('unexpected.txt', 'not reviewed');\n" +
				"execFileSync('git', ['add', 'unexpected.txt']);\n"
		);
		git('add', '.');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: unexpected version hook');
		expect(() => createReleaseTag('release/v1.4.10', 'HEAD', repository)).toThrow(
			'without changing files'
		);
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
		expect(git('status', '--porcelain')).toBe('');
	});

	it('never overwrites conflicting remote tags', async () => {
		const sha = await commit('1.4.10');
		createReleaseTag('release/v1.4.10', sha, repository);
		await writeFile(join(repository, 'other'), 'different commit');
		const other = await commit('1.4.10');
		expect(() => createReleaseTag('release/v1.4.10', other, repository)).toThrow(
			'different commit'
		);
		expect(remoteGit('rev-parse', 'refs/tags/v1.4.10^{commit}^')).toBe(sha);
	});
	it('rejects version regressions', async () => {
		const old = await commit('1.4.9');
		const current = await commit('1.4.10');
		createReleaseTag('release/v1.4.10', current, repository);
		expect(() => createReleaseTag('release/v1.4.9', old, repository)).toThrow('not newer');
	});

	it('rejects a release ref that differs from the committed version', async () => {
		const sha = await commit('1.4.10');
		expect(() => createReleaseTag('release/v1.4.9', sha, repository)).toThrow('does not match');
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
	});

	it('checks both committed version files', async () => {
		await commit('1.4.10');
		const pkg = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
		await writeFile(
			join(repository, 'package.json'),
			JSON.stringify({ ...pkg, version: '1.4.9' })
		);
		git('add', 'package.json');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: inconsistent version');
		expect(() => createReleaseTag('release/v1.4.10', 'HEAD', repository)).toThrow(
			'does not match manifest version'
		);
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
	});

	it('refuses publication when pnpm tag creation is disabled', async () => {
		await writeFile(
			join(repository, 'pnpm-workspace.yaml'),
			'tagVersionPrefix: v\ngitTagVersion: false\npmOnFail: error\n'
		);
		const sha = await commit('1.4.10');
		expect(() => createReleaseTag('release/v1.4.10', sha, repository)).toThrow(
			'pnpm version must create a release commit/tag'
		);
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
		expect(git('status', '--porcelain')).toBe('');
	});

	it('recognizes an existing annotated remote tag without rewriting it', async () => {
		const sha = await commit('1.4.10');
		git('-c', 'tag.gpgSign=false', 'tag', '-a', 'v1.4.10', sha, '-m', 'Existing release');
		git('push', 'origin', 'refs/tags/v1.4.10');
		const tags = git('ls-remote', '--tags', 'origin');
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('existing');
		expect(git('ls-remote', '--tags', 'origin')).toBe(tags);
	});
});
