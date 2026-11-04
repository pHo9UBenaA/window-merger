import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPackageVersion } from '../../scripts/sync-version/read';
import { operate as writeVersion } from '../../scripts/sync-version/write';
import { useOperationRoot } from '../helpers/script-operations';

const syncExtensionVersion = (root: string): void => writeVersion(readPackageVersion(root));

describe('pnpm version hook', () => {
	let repository: string;
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: repository,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();

	beforeEach(async () => {
		repository = await mkdtemp(join(tmpdir(), 'window-merger-version-'));
		await mkdir(join(repository, 'src/assets'), { recursive: true });
		await writeFile(
			join(repository, 'package.json'),
			'{"name":"hook-fixture","version":"1.5.0"}'
		);
		await writeFile(
			join(repository, 'src/assets/manifest.json'),
			'{"manifest_version":3,"name":"Window Merger","version":"1.4.10"}\n'
		);
		git('init', '-b', 'main');
		git('add', '.');
		git(
			'-c',
			'user.name=Version Test',
			'-c',
			'user.email=test@example.invalid',
			'-c',
			'commit.gpgsign=false',
			'commit',
			'-m',
			'Initial version'
		);
		useOperationRoot(repository);
	});

	afterEach(async () => {
		await rm(repository, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it('copies the package version without staging or modifying unrelated files', async () => {
		await writeFile(join(repository, 'unrelated.txt'), 'not part of this release');
		syncExtensionVersion(repository);
		expect(
			JSON.parse(await readFile(join(repository, 'src/assets/manifest.json'), 'utf8'))
		).toEqual({
			manifest_version: 3,
			name: 'Window Merger',
			version: '1.5.0',
		});
		expect(git('diff', '--cached', '--name-only')).toBe('');
	});

	it('does not reformat an already synchronized manifest', async () => {
		const original = '{ "manifest_version": 3, "version": "1.5.0" }\n';
		await writeFile(join(repository, 'src/assets/manifest.json'), original);
		syncExtensionVersion(repository);
		expect(await readFile(join(repository, 'src/assets/manifest.json'), 'utf8')).toBe(original);
	});

	it.each(['1.5.0-beta.1', '1.2.3.4', '1.5.65536', '0.0.0', '01.5.0'])(
		'rejects a package version that cannot be released as the extension: %s',
		async (version) => {
			const original = await readFile(join(repository, 'src/assets/manifest.json'), 'utf8');
			await writeFile(join(repository, 'package.json'), JSON.stringify({ version }));
			expect(() => syncExtensionVersion(repository)).toThrow();
			expect(await readFile(join(repository, 'src/assets/manifest.json'), 'utf8')).toBe(
				original
			);
			expect(git('diff', '--cached', '--name-only')).toBe('');
		}
	);
});
