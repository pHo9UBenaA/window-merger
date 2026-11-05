import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { inspectRelease } from '../../scripts/release/inspect';
import { fixtureEnvironment as environment } from '../helpers/fixture-command';

it('rejects check flags and skips ordinary branches without requiring a Git repository', () => {
	const script = join(PROJECT_ROOT, 'scripts/release/main.ts');
	const options = {
		cwd: tmpdir(),
		encoding: 'utf8',
		stdio: 'pipe',
		env: { ...environment(), RELEASE_BRANCH: 'feature/example', RELEASE_COMMIT: 'HEAD' },
	} as const;
	expect(() => execFileSync(process.execPath, [script, '--check-push'], options)).toThrow(
		'Use pnpm release:check'
	);
	expect(execFileSync(process.execPath, [script], options).trim()).toBe('skipped');
});

it('compares remote release versions numerically, including annotated tags', () => {
	const input = {
		action: 'newer',
		prefix: 'release-',
		refs: ['refs/tags/release-1.4.10', 'refs/tags/release-1.4.10^{}'],
	};
	expect(() => inspectRelease({ ...input, version: '1.4.9' })).toThrow('not newer');
	expect(() => inspectRelease({ ...input, version: '1.4.11' })).not.toThrow();
});

describe('release publication', { timeout: 30_000 }, () => {
	let directory: string;
	let repository: string;
	let remote: string;
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: repository,
			env: environment(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	const remoteGit = (...args: string[]) =>
		execFileSync('git', ['--git-dir', remote, ...args], {
			env: environment(),
			encoding: 'utf8',
		}).trim();
	const publish = (ref: string, commit = 'HEAD') =>
		execFileSync(
			'pnpm',
			['--silent', '--config.verifyDepsBeforeRun=false', 'run', 'release:publish'],
			{
				cwd: repository,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...environment(),
					RELEASE_BRANCH: ref,
					RELEASE_COMMIT: commit,
					GIT_DIR: join(repository, '.git'),
					GIT_WORK_TREE: repository,
					GIT_INDEX_FILE: join(repository, '.git/index'),
				},
			}
		).trim();
	const commit = async (version: string) => {
		const { packageManager, scripts } = JSON.parse(
			await readFile(join(PROJECT_ROOT, 'package.json'), 'utf8')
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
			env: environment(),
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		git('add', '.');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', `chore: release ${version}`);
		return git('rev-parse', 'HEAD');
	};
	beforeEach(async () => {
		directory = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-tag-test-')));
		repository = join(directory, 'repository');
		remote = join(directory, 'remote.git');
		await mkdir(join(repository, 'src/assets'), { recursive: true });
		await cp(join(PROJECT_ROOT, 'scripts'), join(repository, 'scripts'), { recursive: true });
		await writeFile(
			join(repository, 'pnpm-workspace.yaml'),
			'tagVersionPrefix: v\npmOnFail: error\n'
		);
		await copyFile(join(PROJECT_ROOT, '.npmrc'), join(repository, '.npmrc'));
		git('init', '-b', 'main');
		git('config', 'user.name', 'Release Test');
		git('config', 'user.email', 'test@example.invalid');
		git('init', '--bare', remote);
		git('remote', 'add', 'origin', remote);
	});
	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it('publishes only the approved snapshot, safely reruns and refuses conflicting remote tags', async () => {
		await writeFile(
			join(repository, 'pnpm-workspace.yaml'),
			'tagVersionPrefix: release-%s-\npmOnFail: error\n'
		);
		const approved = await commit('1.4.10');
		execFileSync('pnpm', ['version', '1.4.11', '--no-git-tag-version'], {
			cwd: repository,
			env: environment(),
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		expect(
			JSON.parse(await readFile(join(repository, 'src/assets/manifest.json'), 'utf8'))
		).toEqual({ manifest_version: 3, name: 'Release fixture', version: '1.4.11' });
		git('add', '.');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: next version');
		const current = git('rev-parse', 'HEAD');
		const tag = 'release-%s-1.4.10';
		git('tag', tag, current);
		expect(publish('release/v1.4.10', approved)).toBe('created');
		const marker = remoteGit('rev-parse', `refs/tags/${tag}^{commit}`);
		expect(remoteGit('cat-file', '-t', `refs/tags/${tag}`)).toBe('tag');
		expect(remoteGit('rev-parse', `${marker}^`)).toBe(approved);
		expect(remoteGit('rev-parse', `${marker}^{tree}`)).toBe(
			git('rev-parse', `${approved}^{tree}`)
		);
		expect(publish('release/v1.4.10', approved)).toBe('existing');
		expect(git('rev-parse', 'HEAD')).toBe(current);
		expect(git('status', '--porcelain')).toBe('');
		expect(git('ls-remote', '--heads', 'origin')).toBe('');
		expect(git('rev-parse', tag)).toBe(current);

		await writeFile(join(repository, 'other'), 'different snapshot');
		const conflicting = await commit('1.4.10');
		expect(() => publish('release/v1.4.10', conflicting)).toThrow('different commit');
		expect(remoteGit('rev-parse', `refs/tags/${tag}^{commit}`)).toBe(marker);
	});

	it('rejects inconsistent branch and committed-manifest versions before publication', async () => {
		await commit('1.4.10');
		expect(() => publish('release/v1.4.9')).toThrow('does not match');
		const path = join(repository, 'package.json');
		await writeFile(
			path,
			JSON.stringify({ ...JSON.parse(await readFile(path, 'utf8')), version: '1.4.9' })
		);
		git('add', 'package.json');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: inconsistent version');
		expect(() => publish('release/v1.4.10')).toThrow('does not match manifest version');
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
	});

	it('does not publish changes introduced by the version hook', async () => {
		await commit('1.4.10');
		const path = join(repository, 'package.json');
		const pkg = JSON.parse(await readFile(path, 'utf8'));
		pkg.scripts.version +=
			' && node --permission --allow-fs-read=* --allow-fs-write=* --allow-child-process scripts/unexpected.mjs';
		await writeFile(path, JSON.stringify(pkg));
		await writeFile(
			join(repository, 'scripts/unexpected.mjs'),
			"import { writeFileSync } from 'node:fs';\n" +
				"import { execFileSync } from 'node:child_process';\n" +
				"writeFileSync('unexpected.txt', 'not reviewed');\n" +
				"execFileSync('git', ['add', 'unexpected.txt']);\n"
		);
		git('add', '.');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: unexpected version hook');
		expect(() => publish('release/v1.4.10')).toThrow('without changing files');
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
		expect(git('status', '--porcelain')).toBe('');
	});

	it('refuses publication when pnpm tag creation is disabled', async () => {
		await writeFile(
			join(repository, 'pnpm-workspace.yaml'),
			'tagVersionPrefix: v\ngitTagVersion: false\npmOnFail: error\n'
		);
		await commit('1.4.10');
		expect(() => publish('release/v1.4.10')).toThrow(
			'pnpm version must create a release commit/tag'
		);
		expect(git('ls-remote', '--tags', 'origin')).toBe('');
	});

	it('recognizes legacy annotated tags pointing directly to the approved commit', async () => {
		const approved = await commit('1.4.10');
		git('-c', 'tag.gpgSign=false', 'tag', '-a', 'v1.4.10', approved, '-m', 'Existing release');
		git('push', 'origin', 'refs/tags/v1.4.10');
		const tags = git('ls-remote', '--tags', 'origin');
		expect(publish('release/v1.4.10', approved)).toBe('existing');
		expect(git('ls-remote', '--tags', 'origin')).toBe(tags);
	});
});
