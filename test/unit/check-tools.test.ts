import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { operate } from '../../scripts/lib/check-tools';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
afterEach(() => {
	vi.restoreAllMocks();
});

it('allows the Biome CLI shim to start its native binary without granting filesystem writes', () => {
	const root = process.cwd();
	const snapshot = join(root, '.window-merger-index-test');
	operate({ tool: 'biome', snapshot });
	expect(execFileSync).toHaveBeenCalledWith(
		join(root, 'node_modules/.bin/biome'),
		expect.arrayContaining(['--config-path', join(snapshot, 'biome.json')]),
		expect.objectContaining({
			cwd: snapshot,
			env: expect.objectContaining({
				NODE_OPTIONS: '--permission --allow-fs-read=* --allow-child-process',
			}),
		})
	);
});

it('allows secretlint workers but not subprocesses, and uses the staged configuration', () => {
	const root = process.cwd();
	const snapshot = join(root, '.window-merger-index-test');
	vi.stubEnv('GIT_INDEX_FILE', 'original-index');
	try {
		operate({ tool: 'secretlint', snapshot, files: ['file with spaces.txt'] });
		const options = vi.mocked(execFileSync).mock.calls[0][2];
		expect(options).toMatchObject({
			cwd: snapshot,
			env: expect.objectContaining({
				NODE_OPTIONS: '--permission --allow-fs-read=* --allow-worker',
			}),
		});
		expect(options?.env).not.toHaveProperty('GIT_INDEX_FILE');
		expect(vi.mocked(execFileSync).mock.calls[0][1]).toEqual([
			'--secretlintrc',
			join(snapshot, '.secretlintrc.json'),
			'--no-gitignore',
			'--no-glob',
			'--',
			'file with spaces.txt',
		]);
	} finally {
		vi.unstubAllEnvs();
	}
});

it('rejects arbitrary tool names and file paths outside the snapshot', () => {
	const snapshot = join(process.cwd(), '.window-merger-index-test');
	expect(() => operate({ tool: 'sh', snapshot, files: [] })).toThrow('Unsupported');
	expect(() => operate({ tool: 'secretlint', snapshot, files: ['../outside'] })).toThrow(
		'must stay inside'
	);
	expect(execFileSync).not.toHaveBeenCalled();
});
