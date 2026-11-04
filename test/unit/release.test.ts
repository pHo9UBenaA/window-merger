import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRelease, checkVersions, releaseVersion } from '../../scripts/lib/release-version';
import { createReleaseTag } from '../../scripts/release/main';
import { useOperationRoot } from '../helpers/script-operations';

vi.mock('../../scripts/lib/run-node', async () => ({
	runNode: (await import('../helpers/script-operations')).runScript,
}));

it.each(['release/v1.4.10', 'v1.4.10', 'refs/heads/release/v1.4.10', 'refs/tags/v1.4.10'])(
	'recognizes %s',
	(ref) => {
		expect(releaseVersion(ref)).toBe('1.4.10');
	}
);
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
				},
			})
		);
		await writeFile(join(repository, 'src/assets/manifest.json'), JSON.stringify({ version }));
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

	it('runs CLI validation through a symlink instead of silently skipping it', async () => {
		const sha = await commit('1.4.10');
		const alias = join(directory, 'release-alias.ts');
		await symlink(
			fileURLToPath(new URL('../../scripts/release/check.ts', import.meta.url)),
			alias
		);
		expect(() =>
			execFileSync(process.execPath, [alias], {
				cwd: repository,
				env: { ...process.env, RELEASE_BRANCH: 'release/v1.4.9', RELEASE_COMMIT: sha },
				stdio: ['ignore', 'pipe', 'pipe'],
			})
		).toThrow('does not match');
	});

	it.each(['feature/example', 'release/v1.4.10'])(
		'reads each committed version file once when checking %s',
		async (branch) => {
			const sha = await commit('1.4.10');
			const trace = join(directory, 'version-check.jsonl');
			const script = fileURLToPath(
				new URL('../../scripts/release/check.ts', import.meta.url)
			);
			execFileSync(process.execPath, [script], {
				cwd: repository,
				env: {
					...process.env,
					RELEASE_BRANCH: branch,
					RELEASE_COMMIT: sha,
					GIT_TRACE2_EVENT: trace,
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			const reads = (await readFile(trace, 'utf8'))
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line))
				.filter(
					(event) =>
						event.event === 'start' &&
						event.argv?.[0] === 'git' &&
						event.argv[1] === 'show'
				)
				.map((event) => event.argv.slice(2));
			expect(reads).toEqual([[`${sha}:package.json`], [`${sha}:src/assets/manifest.json`]]);
		}
	);

	it('rejects the removed push-check option without publishing a tag', async () => {
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

	it('checks the committed manifest instead of the working tree', async () => {
		const sha = await commit('1.4.10');
		await writeFile(join(repository, 'src/assets/manifest.json'), '{"version":"9.9.9"}');
		expect(checkRelease('release/v1.4.10', sha, repository)).toBe('1.4.10');
		expect(() => checkRelease('release/v1.4.9', sha, repository)).toThrow('does not match');
	});
	it('publishes pnpm’s annotated marker without changing the checkout or main, and safely reruns', async () => {
		const sha = await commit('1.4.10');
		const current = await commit('1.4.11');
		git('tag', 'unrelated-local-tag');
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('created');
		const marker = remoteGit('rev-parse', 'refs/tags/v1.4.10^{commit}');
		expect(marker).not.toBe(sha);
		expect(remoteGit('cat-file', '-t', 'refs/tags/v1.4.10')).toBe('tag');
		expect(remoteGit('rev-parse', `${marker}^`)).toBe(sha);
		expect(remoteGit('rev-parse', `${marker}^{tree}`)).toBe(git('rev-parse', `${sha}^{tree}`));
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('existing');
		expect(remoteGit('rev-parse', 'refs/tags/v1.4.10^{commit}')).toBe(marker);
		expect(git('rev-parse', 'HEAD')).toBe(current);
		expect(git('status', '--porcelain')).toBe('');
		expect(git('ls-remote', '--heads', 'origin')).toBe('');
		expect(git('tag', '--list')).toBe('unrelated-local-tag');
	});
	it('uses the real pnpm version command to prepare both manifests without a local tag', async () => {
		const sha = await commit('1.4.10');
		execFileSync('pnpm', ['version', '1.4.11', '--no-git-tag-version'], {
			cwd: repository,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		for (const file of ['package.json', 'src/assets/manifest.json']) {
			expect(JSON.parse(await readFile(join(repository, file), 'utf8')).version).toBe(
				'1.4.11'
			);
		}
		expect(git('diff', '--cached', '--name-only')).toBe('src/assets/manifest.json');
		expect(git('tag', '--list')).toBe('');
		expect(git('rev-parse', 'HEAD')).toBe(sha);
	});

	it('publishes through the workflow command without modifying the caller or installing dependencies', async () => {
		const sha = await commit('1.4.10');
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
		};
		delete env.npm_execpath;
		const output = execFileSync(executable, args, {
			cwd: repository,
			env,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		expect(output.trim()).toBe('created');
		const marker = remoteGit('rev-parse', 'refs/tags/v1.4.10^{commit}');
		expect(remoteGit('rev-parse', `${marker}^`)).toBe(sha);
		expect(remoteGit('rev-parse', `${marker}^{tree}`)).toBe(git('rev-parse', `${sha}^{tree}`));
		expect(git('rev-parse', 'HEAD')).toBe(sha);
		expect(git('status', '--porcelain')).toBe('');
		await expect(readFile(join(repository, 'node_modules'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('runs the publishing CLI without an inherited npm executable', async () => {
		const sha = await commit('1.4.10');
		const env: NodeJS.ProcessEnv = {
			...process.env,
			RELEASE_BRANCH: 'release/v1.4.10',
			RELEASE_COMMIT: sha,
		};
		delete env.npm_execpath;
		const output = execFileSync(
			process.execPath,
			[fileURLToPath(new URL('../../scripts/release/main.ts', import.meta.url))],
			{ cwd: repository, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		expect(output.trim()).toBe('created');
		expect(remoteGit('rev-parse', 'refs/tags/v1.4.10^{commit}^')).toBe(sha);
	});

	it('starts the version reader without inherited write or child-process grants', async () => {
		await writeFile(
			join(repository, 'scripts/sync-version/read.ts'),
			`
import { readFileSync } from 'node:fs';
if (process.permission.has('child') || process.permission.has('fs.write') || process.permission.has('fs.read')) {
  throw new Error('The version reader inherited broader permissions');
}
console.log(JSON.stringify({ version: JSON.parse(readFileSync('package.json', 'utf8')).version }));`
		);
		const sha = await commit('1.4.10');
		vi.stubEnv(
			'NODE_OPTIONS',
			'--permission --allow-fs-read=* --allow-fs-write=* --allow-child-process'
		);
		try {
			expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('created');
		} finally {
			vi.unstubAllEnvs();
		}
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

	it('isolates pnpm and Git from inherited repository and index variables', async () => {
		const sha = await commit('1.4.10');
		vi.stubEnv('GIT_DIR', join(repository, '.git'));
		vi.stubEnv('GIT_WORK_TREE', repository);
		vi.stubEnv('GIT_INDEX_FILE', join(repository, '.git/index'));
		try {
			expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('created');
			expect(git('rev-parse', 'HEAD')).toBe(sha);
			expect(git('status', '--porcelain')).toBe('');
			expect(git('tag', '--list')).toBe('');
		} finally {
			vi.unstubAllEnvs();
		}
		expect(remoteGit('rev-parse', 'refs/tags/v1.4.10^{commit}^')).toBe(sha);
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
	it('leaves a conflicting local tag untouched while publishing the verified commit', async () => {
		const previous = await commit('1.4.9');
		const sha = await commit('1.4.10');
		git('tag', 'v1.4.10', previous);
		expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('created');
		expect(git('rev-parse', 'v1.4.10')).toBe(previous);
		expect(remoteGit('rev-parse', 'refs/tags/v1.4.10^{commit}^')).toBe(sha);
	});

	it.each(['release-', '', 'release-%s-'])(
		'uses pnpm’s configured tag prefix %j',
		async (prefix) => {
			await writeFile(
				join(repository, 'pnpm-workspace.yaml'),
				`tagVersionPrefix: ${JSON.stringify(prefix)}\npmOnFail: error\n`
			);
			const sha = await commit('1.4.10');
			expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('created');
			expect(remoteGit('rev-parse', `refs/tags/${prefix}1.4.10^{commit}^`)).toBe(sha);
			expect(createReleaseTag('release/v1.4.10', sha, repository)).toBe('existing');
		}
	);

	it('checks both committed version files', async () => {
		await commit('1.4.10');
		await writeFile(
			join(repository, 'package.json'),
			'{"name":"release-fixture","version":"1.4.9"}'
		);
		git('add', 'package.json');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: inconsistent version');
		expect(() => checkVersions('HEAD', repository)).toThrow('does not match manifest version');
		expect(() => createReleaseTag('release/v1.4.10', 'HEAD', repository)).toThrow(
			'does not match manifest version'
		);
		expect(() =>
			execFileSync(
				process.execPath,
				[fileURLToPath(new URL('../../scripts/release/check.ts', import.meta.url))],
				{
					cwd: repository,
					env: {
						...process.env,
						RELEASE_BRANCH: 'feature/example',
						RELEASE_COMMIT: 'HEAD',
					},
					stdio: ['ignore', 'pipe', 'pipe'],
				}
			)
		).toThrow('does not match manifest version');
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
