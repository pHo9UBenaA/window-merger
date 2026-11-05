import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hasCodeChanges, withIndexSnapshot } from '../../scripts/pre-commit/main';

let root: string;
const git = (...args: string[]) =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-hook-test-')));
	git('init', '-b', 'main');
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

it.each([
	['README.md', false],
	['icon.png', true],
])('selects code checks for staged %s: %s', async (name, expected) => {
	await writeFile(join(root, name), 'staged');
	git('add', '--', name);
	await writeFile(join(root, 'unstaged.ts'), 'not staged');
	expect(hasCodeChanges(root)).toBe(expected);
});

it('still runs code checks when code is renamed to Markdown or deleted', async () => {
	await writeFile(join(root, 'example.ts'), 'export {};');
	git('add', 'example.ts');
	git(
		'-c',
		'user.name=Hook Test',
		'-c',
		'user.email=test@example.invalid',
		'-c',
		'commit.gpgsign=false',
		'commit',
		'-m',
		'test: add fixture'
	);
	await rename(join(root, 'example.ts'), join(root, 'README.md'));
	git('add', '-A');
	expect(hasCodeChanges(root)).toBe(true);
	await rm(join(root, 'README.md'));
	git('add', '-A');
	expect(hasCodeChanges(root)).toBe(true);
});

it('checks staged content and cleans up rejected checks without changing the working tree or index', async () => {
	await writeFile(join(root, 'old'), 'rename');
	await writeFile(join(root, 'deleted'), 'delete');
	git('add', 'old', 'deleted');
	await rename(join(root, 'old'), join(root, 'new'));
	await rm(join(root, 'deleted'));
	git('add', '-A');
	await writeFile(join(root, 'untracked'), 'not committed');
	const name = 'file [with spaces].ts';
	const file = join(root, name);
	await writeFile(file, 'invalid staged content');
	git('add', '--', name);
	await writeFile(file, 'fixed but not staged');
	let snapshotPath = '';
	await expect(
		withIndexSnapshot(root, async (snapshot, files) => {
			snapshotPath = snapshot;
			expect(files).toEqual([name, 'new']);
			expect(await readFile(join(snapshot, name), 'utf8')).toBe('invalid staged content');
			expect(await readFile(join(snapshot, 'new'), 'utf8')).toBe('rename');
			await expect(readFile(join(snapshot, 'untracked'))).rejects.toMatchObject({
				code: 'ENOENT',
			});
			throw new Error('Staged failure');
		})
	).rejects.toThrow('Staged failure');
	expect(await readFile(file, 'utf8')).toBe('fixed but not staged');
	expect(git('show', `:${name}`)).toBe('invalid staged content');
	await expect(readFile(join(snapshotPath, name))).rejects.toMatchObject({ code: 'ENOENT' });
});
