import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it as base, describe, expect } from 'vitest';
import { checkPush, checkRelease, createReleaseTag, releaseVersion } from '../../scripts/release';

base.each(['release/v1.4.10', 'v1.4.10', 'refs/heads/release/v1.4.10', 'refs/tags/v1.4.10'])(
	'recognizes %s',
	(ref) => {
		expect(releaseVersion(ref)).toBe('1.4.10');
	}
);
base('skips non-release branches without accessing a repository', () => {
	expect(createReleaseTag('feature/example', 'HEAD', '/nonexistent/window-merger')).toBe(
		'skipped'
	);
});

describe('release Git integration', () => {
	const it = base.extend<{
		release: {
			directory: string;
			repository: string;
			git: (...args: string[]) => string;
			commit: (version: string) => Promise<string>;
		};
	}>({
		release: async ({ task: _task }, use) => {
			const directory = await mkdtemp(join(tmpdir(), 'window-merger-release-'));
			const repository = join(directory, 'repository');
			const remote = join(directory, 'remote.git');
			const git = (...args: string[]) =>
				execFileSync('git', args, {
					cwd: repository,
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
				}).trim();
			const commit = async (version: string) => {
				await writeFile(
					join(repository, 'src/assets/manifest.json'),
					JSON.stringify({ version })
				);
				git('add', '.');
				git('-c', 'commit.gpgsign=false', 'commit', '-m', `chore: release ${version}`);
				return git('rev-parse', 'HEAD');
			};
			try {
				await mkdir(join(repository, 'src/assets'), { recursive: true });
				git('init', '-b', 'main');
				git('config', 'user.name', 'Release Test');
				git('config', 'user.email', 'test@example.invalid');
				git('init', '--bare', remote);
				git('remote', 'add', 'origin', remote);
				await use({ directory, repository, git, commit });
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		},
	});

	it('runs CLI validation through a symlink instead of silently skipping it', async ({
		release: { directory, repository, commit },
	}) => {
		const sha = await commit('1.4.10');
		const alias = join(directory, 'release-alias.ts');
		await symlink(fileURLToPath(new URL('../../scripts/release.ts', import.meta.url)), alias);
		expect(() =>
			execFileSync(process.execPath, ['--experimental-strip-types', alias, '--check'], {
				cwd: repository,
				env: { ...process.env, RELEASE_BRANCH: 'release/v1.4.9', RELEASE_COMMIT: sha },
				stdio: ['ignore', 'pipe', 'pipe'],
			})
		).toThrow('does not match');
	});

	it('checks the committed manifest and both sides of a push, including tags', async ({
		release: { repository, commit },
	}) => {
		const sha = await commit('1.4.10');
		await writeFile(join(repository, 'src/assets/manifest.json'), '{"version":"9.9.9"}');
		expect(checkRelease('release/v1.4.10', sha, repository)).toBe('1.4.10');
		expect(() =>
			checkPush(`refs/heads/main ${sha} refs/tags/v1.4.9 deadbeef`, repository)
		).toThrow('does not match');
		expect(() =>
			checkPush(
				'refs/heads/release/v1.4.9 00000000 refs/heads/release/v1.4.9 deadbeef',
				repository
			)
		).not.toThrow();
	});
	it('publishes only the requested tag at the exact commit and safely reruns', async ({
		release: { repository, git, commit },
	}) => {
		const sha = await commit('1.4.10');
		await commit('1.4.11');
		git('tag', 'unrelated-local-tag');
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('created');
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('existing');
		expect(git('ls-remote', '--tags', 'origin')).toBe(`${sha}\trefs/tags/v1.4.10`);
		expect(git('tag', '--list')).toBe('unrelated-local-tag');
	});
	it('never overwrites conflicting remote tags', async ({
		release: { repository, git, commit },
	}) => {
		const sha = await commit('1.4.10');
		createReleaseTag('release/v1.4.10', sha, repository);
		await writeFile(join(repository, 'other'), 'different commit');
		const other = await commit('1.4.10');
		expect(() => createReleaseTag('release/v1.4.10', other, repository)).toThrow(
			'different commit'
		);
		expect(git('ls-remote', '--tags', 'origin')).toContain(sha);
	});
	it('rejects version regressions', async ({ release: { repository, commit } }) => {
		const old = await commit('1.4.9');
		const current = await commit('1.4.10');
		createReleaseTag('release/v1.4.10', current, repository);
		expect(() => createReleaseTag('release/v1.4.9', old, repository)).toThrow('not newer');
	});
	it('leaves a conflicting local tag untouched while publishing the verified commit', async ({
		release: { repository, git, commit },
	}) => {
		const previous = await commit('1.4.9');
		const sha = await commit('1.4.10');
		git('tag', 'v1.4.10', previous);
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('created');
		expect(git('rev-parse', 'v1.4.10')).toBe(previous);
		expect(git('ls-remote', '--tags', 'origin')).toBe(`${sha}\trefs/tags/v1.4.10`);
	});

	it('recognizes an existing annotated remote tag without rewriting it', async ({
		release: { repository, git, commit },
	}) => {
		const sha = await commit('1.4.10');
		git('-c', 'tag.gpgSign=false', 'tag', '-a', 'v1.4.10', sha, '-m', 'Existing release');
		git('push', 'origin', 'refs/tags/v1.4.10');
		const tags = git('ls-remote', '--tags', 'origin');
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('existing');
		expect(git('ls-remote', '--tags', 'origin')).toBe(tags);
	});
});
