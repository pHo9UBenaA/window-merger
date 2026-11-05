import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

it.each([
	'',
	'\n',
	'refs/heads/main deadbeef refs/heads/main deadbeef',
	'refs/heads/release/v1.4.9 00000000 refs/heads/release/v1.4.9 deadbeef',
	'(delete) 00000000 refs/tags/v1.4.9 deadbeef',
	'(delete) 00000000 refs/tags/v65536.1.0 deadbeef',
])('does not request Git reads for ordinary refs, deletions or empty input: %j', (input) => {
	expect(planPushChecks(input)).toEqual([]);
});

it('groups local and destination release refs by commit without duplicate reads', () => {
	const input = [
		'refs/heads/release/v1.4.10 abc123 refs/tags/v1.4.10 deadbeef',
		'refs/heads/main abc123 refs/tags/v1.4.9 deadbeef',
		'refs/heads/release/v1.4.10 abc123 refs/heads/main deadbeef',
	].join('\n');
	expect(planPushChecks(input)).toEqual([
		{
			commit: 'abc123',
			refs: ['refs/heads/release/v1.4.10', 'refs/tags/v1.4.10', 'refs/tags/v1.4.9'],
		},
	]);
});

it.each(['refs/heads/main', 'refs/heads/main abc123 refs/tags/v1.4.10', 'one two three four five'])(
	'rejects malformed pre-push records: %j',
	(input) => {
		expect(() => planPushChecks(input)).toThrow('Invalid pre-push record');
	}
);

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

	it.each(['refs/heads/release/v1.4.10', 'refs/tags/v1.4.10'])(
		'accepts a matching release ref: %s',
		(ref) => {
			const result = push(`${ref} ${commitSha} ${ref} deadbeef`);
			expect(result.status, result.stderr).toBe(0);
		}
	);

	it('rejects a mismatched local release branch when pushing to an ordinary branch', () => {
		const result = push(`refs/heads/release/v1.4.9 ${commitSha} refs/heads/main deadbeef`);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('Release refs/heads/release/v1.4.9 does not match');
	});

	it('rejects a mismatched destination tag when pushing from an ordinary branch', () => {
		const result = push(`refs/heads/main ${commitSha} refs/tags/v1.4.9 deadbeef`);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('Release refs/tags/v1.4.9 does not match');
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
		const result = push(`refs/heads/main ${commitSha} refs/tags/v1.4.10 deadbeef`);
		expect(result.status, result.stderr).toBe(0);
	});

	it('reads each committed file once when several refs point to the same commit', async () => {
		const trace = join(repository, 'trace.jsonl');
		const result = push(
			[
				`refs/heads/release/v1.4.10 ${commitSha} refs/tags/v1.4.10 deadbeef`,
				`refs/heads/main ${commitSha} refs/tags/v1.4.10 deadbeef`,
			].join('\n'),
			{ ...environment(), GIT_TRACE2_EVENT: trace }
		);
		expect(result.status, result.stderr).toBe(0);
		const reads = (await readFile(trace, 'utf8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
			.filter((event) => event.event === 'start' && event.argv?.[1] === 'show')
			.map((event) => event.argv.slice(2));
		expect(reads).toEqual([
			[`${commitSha}:package.json`],
			[`${commitSha}:src/assets/manifest.json`],
		]);
	});

	it('does not turn a failed Git read into an empty successful check', () => {
		const result = push('refs/heads/main missing-commit refs/tags/v1.4.10 deadbeef');
		expect(result.status).not.toBe(0);
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

	it('emits requests when the planner is executed through a symlink', async () => {
		const alias = join(repository, 'pre-push-alias.ts');
		await symlink(
			fileURLToPath(new URL('../../scripts/pre-push/main.ts', import.meta.url)),
			alias
		);
		const result = spawnSync(process.execPath, [alias], {
			cwd: repository,
			env: environment(),
			encoding: 'utf8',
			input: `refs/heads/main ${commitSha} refs/tags/v1.4.9 deadbeef\n`,
		});
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual([
			{ commit: commitSha, refs: ['refs/tags/v1.4.9'] },
		]);
		expect(git('tag', '--list')).toBe('');
	});
});
