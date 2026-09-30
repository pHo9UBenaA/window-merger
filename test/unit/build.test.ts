import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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
		await packageExtension(relative(process.cwd(), root));
		const archive = join(root, 'dist.zip');
		execFileSync('unzip', ['-tq', archive]);
		const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).split('\n');
		expect(entries).toContain('manifest.json');
		expect(entries).toContain('background.js');
		expect(entries).not.toContain('dist/manifest.json');
		expect(entries).not.toContain('obsolete.txt');
		await expect(validateExtension(join(root, 'dist'))).resolves.toBeUndefined();
		await expect(readFile(join(root, 'dist.tmp.zip'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('does not leave an old or partial archive after build failure', async () => {
		await packageExtension(root);
		await writeFile(join(root, 'dist.tmp.zip'), 'interrupted output');
		await writeFile(join(root, 'src/background.ts'), 'invalid { syntax');
		await expect(packageExtension(root)).rejects.toThrow();
		await expect(readFile(join(root, 'dist.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(readFile(join(root, 'dist.tmp.zip'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('removes a partial archive when the zip command fails', async () => {
		await packageExtension(root);
		const bin = join(root, 'bin');
		await mkdir(bin);
		await writeFile(
			join(bin, 'zip'),
			'#!/bin/sh\nfor arg do\n  case "$arg" in *.tmp.zip) printf partial > "$arg";; esac\ndone\nexit 1\n',
			{ mode: 0o755 }
		);
		vi.stubEnv('PATH', bin);
		try {
			await expect(packageExtension(root)).rejects.toThrow();
		} finally {
			vi.unstubAllEnvs();
		}
		await expect(readFile(join(root, 'dist.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(readFile(join(root, 'dist.tmp.zip'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('refuses to package a missing manifest asset', async () => {
		await rm(join(root, 'src/assets/icon-16.png'));
		await expect(packageExtension(root)).rejects.toThrow();
		await expect(readFile(join(root, 'dist.zip'))).rejects.toThrow();
	});

	it('allows missing translations to fall back to the default locale', async () => {
		await writeFile(join(root, 'src/assets/_locales/ja/messages.json'), '{}');
		await expect(packageExtension(root)).resolves.toBeUndefined();
	});

	it('rejects missing messages in the default locale', async () => {
		await writeFile(join(root, 'src/assets/_locales/en/messages.json'), '{}');
		await expect(packageExtension(root)).rejects.toThrow('Missing message');
	});

	it.each([
		'121',
		'121.0.6167.85',
	])('takes Chrome %s from the manifest as its build target', async (minimum) => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.minimum_chrome_version = minimum;
		await writeFile(path, JSON.stringify(manifest));
		await expect(packageExtension(root)).resolves.toBeUndefined();
		manifest.minimum_chrome_version = 'not-a-version';
		await writeFile(path, JSON.stringify(manifest));
		await expect(packageExtension(root)).rejects.toThrow('Invalid version');
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
