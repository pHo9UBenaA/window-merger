import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hasCodeChanges, withIndexSnapshot } from '../../scripts/pre-commit';

let root: string;
const git = (...args: string[]) =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'window-merger-hook-test-'));
	await mkdir(join(root, 'node_modules'));
	git('init', '-b', 'main');
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

it.each([
	['README.md', false],
	['example.ts', true],
	['package.json', true],
	['compose.yaml', true],
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

it('checks staged content without changing the working tree or index', async () => {
	const file = join(root, 'file [with spaces].txt');
	await writeFile(file, 'staged content');
	git('add', '--', 'file [with spaces].txt');
	await writeFile(file, 'unstaged content');
	let snapshotPath = '';
	await withIndexSnapshot(root, async (snapshot, files) => {
		snapshotPath = snapshot;
		expect(files).toEqual(['file [with spaces].txt']);
		expect(await readFile(join(snapshot, files[0]), 'utf8')).toBe('staged content');
	});
	expect(await readFile(file, 'utf8')).toBe('unstaged content');
	expect(git('show', ':file [with spaces].txt')).toBe('staged content');
	await expect(readFile(join(snapshotPath, 'file [with spaces].txt'))).rejects.toThrow();
});

it('keeps staged failures visible and cleans up after a rejected check', async () => {
	await writeFile(join(root, 'file.ts'), 'invalid staged content');
	git('add', 'file.ts');
	await writeFile(join(root, 'file.ts'), 'fixed but not staged');
	let snapshotPath = '';
	await expect(
		withIndexSnapshot(root, async (snapshot) => {
			snapshotPath = snapshot;
			if ((await readFile(join(snapshot, 'file.ts'), 'utf8')).startsWith('invalid'))
				throw new Error('Staged failure');
		})
	).rejects.toThrow('Staged failure');
	expect(await readFile(join(root, 'file.ts'), 'utf8')).toBe('fixed but not staged');
	await expect(readFile(join(snapshotPath, 'file.ts'))).rejects.toThrow();
});

it('exports additions and renames but not staged deletions or untracked files', async () => {
	await writeFile(join(root, 'old'), 'rename');
	await writeFile(join(root, 'deleted'), 'delete');
	git('add', 'old', 'deleted');
	await rename(join(root, 'old'), join(root, 'new'));
	await rm(join(root, 'deleted'));
	git('add', '-A');
	await writeFile(join(root, 'untracked'), 'not committed');
	await withIndexSnapshot(root, async (_snapshot, files) => {
		expect(files).toEqual(['new']);
	});
});
