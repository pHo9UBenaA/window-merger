import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_ROOT, watchExtension } from '../../build';
import { packageExtension } from '../../scripts/package';
import { validateExtension, validateVersion } from '../../scripts/validate-extension';

let root: string;
let stop: (() => Promise<void>) | undefined;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'window-merger-build-'));
	await cp(join(PROJECT_ROOT, 'src'), join(root, 'src'), { recursive: true });
});
afterEach(async () => {
	await stop?.();
	stop = undefined;
	await rm(root, { recursive: true, force: true });
});

describe('extension artifacts', () => {
	it('packages the manifest at the root and never retains deleted files', async () => {
		const obsolete = join(root, 'src/assets/obsolete.txt');
		await writeFile(obsolete, 'old');
		await packageExtension(root);
		await rm(obsolete);
		await packageExtension(root);
		const archive = unzipSync(await readFile(join(root, 'dist.zip')));
		expect(archive['manifest.json']).toBeDefined();
		expect(archive['background.js']).toBeDefined();
		expect(archive['dist/manifest.json']).toBeUndefined();
		expect(archive['obsolete.txt']).toBeUndefined();
		await expect(validateExtension(join(root, 'dist'))).resolves.toBeUndefined();
		await expect(readFile(join(root, 'dist.zip.tmp'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('does not leave an old or partial archive after build failure', async () => {
		await packageExtension(root);
		await writeFile(join(root, 'dist.zip.tmp'), 'interrupted output');
		await writeFile(join(root, 'src/background.ts'), 'invalid { syntax');
		await expect(packageExtension(root)).rejects.toThrow();
		await expect(readFile(join(root, 'dist.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(readFile(join(root, 'dist.zip.tmp'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('refuses to package a missing manifest asset', async () => {
		await rm(join(root, 'src/assets/icon-16.png'));
		await expect(packageExtension(root)).rejects.toThrow();
		await expect(readFile(join(root, 'dist.zip'))).rejects.toThrow();
	});

	it('rejects missing translations', async () => {
		await writeFile(join(root, 'src/assets/_locales/ja/messages.json'), '{}');
		await expect(packageExtension(root)).rejects.toThrow('Missing message');
	});

	it('watches asset edits, additions and deletions as well as source changes', async () => {
		const log = vi.fn();
		stop = await watchExtension({ root }, log);
		const source = join(root, 'src/assets/example.txt');
		const output = join(root, 'dist/example.txt');
		await writeFile(source, 'added');
		await vi.waitFor(async () => expect(await readFile(output, 'utf8')).toBe('added'), {
			timeout: 5000,
		});
		await writeFile(source, 'changed');
		await vi.waitFor(async () => expect(await readFile(output, 'utf8')).toBe('changed'), {
			timeout: 5000,
		});
		await rm(source);
		await vi.waitFor(
			async () => expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' }),
			{ timeout: 5000 }
		);
		const nested = join(root, 'src/assets/nested');
		await mkdir(nested);
		await writeFile(join(nested, 'file.txt'), 'nested asset');
		await vi.waitFor(
			async () =>
				expect(await readFile(join(root, 'dist/nested/file.txt'), 'utf8')).toBe(
					'nested asset'
				),
			{ timeout: 5000 }
		);
		await rm(nested, { recursive: true });
		await vi.waitFor(
			async () =>
				expect(readFile(join(root, 'dist/nested/file.txt'))).rejects.toMatchObject({
					code: 'ENOENT',
				}),
			{ timeout: 5000 }
		);
		await writeFile(join(root, 'src/background.ts'), 'console.log("watch-test-marker");');
		await vi.waitFor(
			async () =>
				expect(await readFile(join(root, 'dist/background.js'), 'utf8')).toContain(
					'watch-test-marker'
				),
			{ timeout: 5000 }
		);
		expect(log).not.toHaveBeenCalled();
	}, 15000);
});

it.each([
	'',
	'01.2',
	'1.2.3.4.5',
	'65536',
	'0.0.0',
	'1.0-beta',
	null,
])('rejects invalid version %s', (version) => {
	expect(() => validateVersion(version)).toThrow();
});
it.each(['1', '0.1', '1.4.10', '65535.65535.65535.65535'])('accepts version %s', (version) => {
	expect(validateVersion(version)).toBe(version);
});
