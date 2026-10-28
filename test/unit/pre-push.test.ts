import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPush } from '../../scripts/pre-push';

it.each([
	'',
	'\n',
	'refs/heads/main deadbeef refs/heads/main deadbeef',
	'refs/heads/release/v1.4.9 00000000 refs/heads/release/v1.4.9 deadbeef',
	'(delete) 00000000 refs/tags/v1.4.9 deadbeef',
])('skips empty input, ordinary refs and deletions without reading a repository: %j', (input) => {
	expect(() => checkPush(input, '/nonexistent/window-merger')).not.toThrow();
});

describe('pre-push version checks', () => {
	let repository: string;
	let commitSha: string;
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: repository,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();

	beforeEach(async () => {
		repository = await mkdtemp(join(tmpdir(), 'window-merger-pre-push-'));
		await mkdir(join(repository, 'src/assets'), { recursive: true });
		await writeFile(join(repository, 'src/assets/manifest.json'), '{"version":"1.4.10"}');
		git('init', '-b', 'main');
		git('config', 'user.name', 'Push Test');
		git('config', 'user.email', 'test@example.invalid');
		git('add', '.');
		git('-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: prepare release');
		commitSha = git('rev-parse', 'HEAD');
	});

	afterEach(async () => {
		await rm(repository, { recursive: true, force: true });
	});

	it.each(['refs/heads/release/v1.4.10', 'refs/tags/v1.4.10'])(
		'accepts a matching release ref: %s',
		(ref) => {
			expect(() =>
				checkPush(`${ref} ${commitSha} ${ref} deadbeef`, repository)
			).not.toThrow();
		}
	);

	it('rejects a mismatched local release branch even when pushing to an ordinary branch', () => {
		expect(() =>
			checkPush(`refs/heads/release/v1.4.9 ${commitSha} refs/heads/main deadbeef`, repository)
		).toThrow('Release refs/heads/release/v1.4.9 does not match');
	});

	it('rejects a mismatched destination tag even when pushing from an ordinary branch', () => {
		expect(() =>
			checkPush(`refs/heads/main ${commitSha} refs/tags/v1.4.9 deadbeef`, repository)
		).toThrow('Release refs/tags/v1.4.9 does not match');
	});

	it('checks subsequent records after a matching release', () => {
		const input = [
			`refs/heads/release/v1.4.10 ${commitSha} refs/heads/release/v1.4.10 deadbeef`,
			`refs/heads/main ${commitSha} refs/tags/v1.4.9 deadbeef`,
		].join('\n');
		expect(() => checkPush(input, repository)).toThrow(
			'Release refs/tags/v1.4.9 does not match'
		);
	});

	it('checks the committed manifest instead of the working tree', async () => {
		await writeFile(join(repository, 'src/assets/manifest.json'), '{"version":"9.9.9"}');
		expect(() =>
			checkPush(`refs/heads/main ${commitSha} refs/tags/v1.4.10 deadbeef`, repository)
		).not.toThrow();
	});

	it.each([
		{ version: '1.4.10', expectedStatus: 0 },
		{ version: '1.4.9', expectedStatus: 1 },
	])('CLI reads stdin through a symlink: $version', async ({ version, expectedStatus }) => {
		const alias = join(repository, 'pre-push-alias.ts');
		await symlink(fileURLToPath(new URL('../../scripts/pre-push.ts', import.meta.url)), alias);
		const result = spawnSync(process.execPath, ['--experimental-strip-types', alias], {
			cwd: repository,
			encoding: 'utf8',
			input: `refs/heads/main ${commitSha} refs/tags/v${version} deadbeef\n`,
		});
		expect(result.error).toBeUndefined();
		expect(result.status, result.stderr).toBe(expectedStatus);
		if (expectedStatus !== 0) expect(result.stderr).toContain('does not match');
		expect(git('tag', '--list')).toBe('');
	});
});
