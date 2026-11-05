import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planPushChecks } from '../../scripts/pre-push/main';
import { fixtureCommand } from '../helpers/fixture-command';

const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const environment = (): NodeJS.ProcessEnv =>
	Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) => name !== 'NODE_OPTIONS' && !name.startsWith('GIT_')
		)
	);

it('does not validate the deleted tag version', () => {
	expect(planPushChecks('(delete) 00000000 refs/tags/v65536.1.0 deadbeef')).toEqual([]);
});

it('preserves Unicode whitespace inside ref names when splitting Git records', () => {
	expect(
		planPushChecks('refs/heads/feature\u00a0name abc123 refs/tags/v1.4.10 deadbeef')
	).toEqual([{ commit: 'abc123', refs: ['refs/tags/v1.4.10'] }]);
});

it('rejects invalid release versions before requesting committed files', () => {
	expect(() => planPushChecks('refs/heads/main abc123 refs/tags/v65536.1.0 deadbeef')).toThrow(
		'Chrome version components'
	);
});

describe('pre-push version pipeline', () => {
	let repository: string;
	let commitSha: string;
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: repository,
			env: environment(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	const push = (input: string, env = environment()) => {
		const result = spawnSync(fixtureCommand(pkg.scripts['hook:pre-push']), {
			cwd: repository,
			env,
			shell: true,
			encoding: 'utf8',
			input,
			timeout: 10_000,
		});
		expect(result.error, result.stderr).toBeUndefined();
		expect(result.signal, result.stderr).toBeNull();
		return result;
	};
	beforeEach(async () => {
		repository = await realpath(
			await mkdtemp(join(tmpdir(), 'window-merger-pre-push with spaces-'))
		);
		await mkdir(join(repository, 'src/assets'), { recursive: true });
		await writeFile(join(repository, 'src/assets/manifest.json'), '{"version":"1.4.10"}');
		await writeFile(
			join(repository, 'package.json'),
			'{"name":"push-fixture","version":"1.4.10"}'
		);
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

	it('rejects a mismatched local release branch when pushing to an ordinary branch', () => {
		const result = push(`refs/heads/release/v1.4.9 ${commitSha} refs/heads/main deadbeef`);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('Release refs/heads/release/v1.4.9 does not match');
	});

	it('checks later records after a matching release', () => {
		const result = push(
			[
				`refs/heads/release/v1.4.10 ${commitSha} refs/heads/release/v1.4.10 deadbeef`,
				`refs/heads/main ${commitSha} refs/tags/v1.4.9 deadbeef`,
			].join('\n')
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('Release refs/tags/v1.4.9 does not match');
	});

	it('validates the committed manifest instead of the working tree', async () => {
		await writeFile(join(repository, 'src/assets/manifest.json'), '{"version":"9.9.9"}');
		const result = push(`refs/heads/release/v1.4.10 ${commitSha} refs/tags/v1.4.10 deadbeef`);
		expect(result.status, result.stderr).toBe(0);
	});

	it('does not accept partial results when a later committed file cannot be read', () => {
		const result = push(
			[
				`refs/heads/main ${commitSha} refs/tags/v1.4.10 deadbeef`,
				'refs/heads/main missing-commit refs/tags/v1.4.10 deadbeef',
			].join('\n')
		);
		expect(result.status).not.toBe(0);
	});

	it('propagates malformed planner input instead of accepting an empty check', () => {
		const result = push('invalid input');
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('Invalid pre-push record');
	});
});
