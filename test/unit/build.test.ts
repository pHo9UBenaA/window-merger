import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { build as esbuild } from 'esbuild';
import { it as base, describe, expect, vi } from 'vitest';
import { buildExtension, collectFiles, PROJECT_ROOT, watchExtension } from '../../scripts/build';
import { packageExtension } from '../../scripts/package';
import { validateExtension, validateVersion } from '../../scripts/validate-extension';

// Observe the real compiler boundary without replacing compilation or packaging.
vi.mock('esbuild', async (importOriginal) => {
	const original = await importOriginal<typeof import('esbuild')>();
	return { ...original, build: vi.fn(original.build) };
});

const it = base.extend<{ root: string }>({
	root: async ({ task: _task }, use) => {
		const root = await mkdtemp(join(tmpdir(), 'window-merger-build-'));
		try {
			await cp(join(PROJECT_ROOT, 'src'), join(root, 'src'), { recursive: true });
			await cp(join(PROJECT_ROOT, 'LICENSE'), join(root, 'LICENSE'));
			await use(root);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
});

describe('extension artifacts', () => {
	it('packages the manifest at the root and never retains deleted files', async ({ root }) => {
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
		expect(entries).toContain('LICENSE');
		expect(execFileSync('unzip', ['-p', archive, 'LICENSE'], { encoding: 'utf8' })).toBe(
			await readFile(join(PROJECT_ROOT, 'LICENSE'), 'utf8')
		);
		expect(entries).not.toContain('dist/manifest.json');
		expect(entries).not.toContain('obsolete.txt');
		await expect(validateExtension(join(root, 'dist'))).resolves.toBeUndefined();
		await expect(readFile(join(root, 'dist.tmp.zip'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('packages exactly the default build output without additional transformations', async ({
		root,
	}) => {
		await buildExtension({ root });
		const directory = join(root, 'dist');
		const expected = new Map<string, Buffer>();
		for (const file of await collectFiles(directory)) {
			expected.set(relative(directory, file), await readFile(file));
		}
		await packageExtension(root);
		const extracted = join(root, 'extracted');
		execFileSync('unzip', ['-q', join(root, 'dist.zip'), '-d', extracted]);
		const files = await collectFiles(extracted);
		expect(files.map((file) => relative(extracted, file)).sort()).toEqual(
			[...expected.keys()].sort()
		);
		for (const [name, data] of expected) {
			expect(await readFile(join(extracted, name))).toEqual(data);
			expect(await readFile(join(directory, name))).toEqual(data);
		}
		expect(esbuild).toHaveBeenLastCalledWith(expect.objectContaining({ minify: true }));
	});

	it('does not publish an archive without the license notice', async ({ root }) => {
		await packageExtension(root);
		await rm(join(root, 'LICENSE'));
		await expect(packageExtension(root)).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(readFile(join(root, 'dist.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('keeps textual and date metadata out of PNG assets', async ({ root }) => {
		for (const path of (await collectFiles(join(root, 'src/assets'))).filter((file) =>
			file.endsWith('.png')
		)) {
			const data = await readFile(path);
			const chunks: string[] = [];
			for (let offset = 8; offset < data.length; ) {
				chunks.push(data.toString('ascii', offset + 4, offset + 8));
				offset += data.readUInt32BE(offset) + 12;
			}
			for (const metadata of ['tEXt', 'zTXt', 'iTXt', 'tIME']) {
				expect(chunks).not.toContain(metadata);
			}
		}
	});

	it('compacts distribution JSON without changing source, messages or placeholders', async ({
		root,
	}) => {
		const source = join(root, 'src/assets/_locales/en/messages.json');
		const messages = JSON.parse(await readFile(source, 'utf8'));
		messages.greeting = {
			message: 'Hello $NAME$ $DESCRIPTION$',
			description: 'Translator guidance',
			placeholders: {
				name: { content: '$1', example: 'Alice' },
				description: { content: '$2', example: 'world' },
			},
		};
		messages.description = { message: 'Description label', description: 'Translator guidance' };
		const original = `${JSON.stringify(messages, null, '\t')}\n`;
		await writeFile(source, original);
		const output = join(root, 'dist/_locales/en/messages.json');
		for (const minify of [false, true]) {
			await buildExtension({ root, minify });
			const compact = await readFile(output, 'utf8');
			const distributed = JSON.parse(compact);
			expect(compact).toBe(JSON.stringify(distributed));
			for (const [key, message] of Object.entries(messages)) {
				if (typeof message !== 'object' || message === null)
					throw new Error(`Invalid test message ${key}`);
				const runtime = Object.fromEntries(
					Object.entries(message).filter(([name]) => name !== 'description')
				);
				expect(distributed[key]).toEqual(runtime);
			}
		}
		const compact = await readFile(output, 'utf8');
		await packageExtension(root);
		expect(await readFile(output, 'utf8')).toBe(compact);
		expect(await readFile(source, 'utf8')).toBe(original);
		const sourceManifest = JSON.parse(
			await readFile(join(root, 'src/assets/manifest.json'), 'utf8')
		);
		expect(await readFile(join(root, 'dist/manifest.json'), 'utf8')).toBe(
			JSON.stringify(sourceManifest)
		);
		expect(
			execFileSync('unzip', ['-p', join(root, 'dist.zip'), '_locales/en/messages.json'], {
				encoding: 'utf8',
			})
		).toBe(compact);
	});

	it('does not leave an old or partial archive after build failure', async ({ root }) => {
		await packageExtension(root);
		await writeFile(join(root, 'dist.tmp.zip'), 'interrupted output');
		await writeFile(join(root, 'src/background.ts'), 'invalid { syntax');
		await expect(packageExtension(root)).rejects.toThrow();
		await expect(readFile(join(root, 'dist.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(readFile(join(root, 'dist.tmp.zip'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('removes a partial archive when the zip command fails', async ({ root }) => {
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

	it('refuses to package a missing manifest asset', async ({ root }) => {
		await rm(join(root, 'src/assets/icon-16.png'));
		await expect(packageExtension(root)).rejects.toMatchObject({
			code: 'ENOENT',
			path: join(root, 'dist/icon-16.png'),
		});
		await expect(readFile(join(root, 'dist.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('rejects an icon whose dimensions do not match its manifest declaration', async ({
		root,
	}) => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.action.default_icon['24'] = 'icon-16.png';
		await writeFile(path, JSON.stringify(manifest));
		await expect(packageExtension(root)).rejects.toThrow('Icon dimensions do not match 24');
	});

	it('rejects a non-PNG icon', async ({ root }) => {
		await writeFile(join(root, 'src/assets/icon-128.png'), 'not a PNG');
		await expect(packageExtension(root)).rejects.toThrow('Expected PNG icon');
	});

	it('requires the Chrome Web Store 128px icon', async ({ root }) => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		delete manifest.icons['128'];
		await writeFile(path, JSON.stringify(manifest));
		await expect(packageExtension(root)).rejects.toThrow('Missing 128px');
	});

	it('supports a single action icon path as well as a size dictionary', async ({ root }) => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.action.default_icon = 'icon-32.png';
		await writeFile(path, JSON.stringify(manifest));
		await expect(packageExtension(root)).resolves.toBeUndefined();
	});

	it.for([
		['name', 75],
		['description', 132],
		['short_name', 12],
	] as const)(
		'validates the actual manifest %s, including literal text',
		async ([key, maximum], { root }) => {
			const path = join(root, 'src/assets/manifest.json');
			const manifest = JSON.parse(await readFile(path, 'utf8'));
			manifest[key] = 'x'.repeat(maximum);
			await writeFile(path, JSON.stringify(manifest));
			await expect(packageExtension(root)).resolves.toBeUndefined();
			manifest[key] += 'x';
			await writeFile(path, JSON.stringify(manifest));
			await expect(packageExtension(root)).rejects.toThrow(`Localized manifest ${key}`);
		}
	);

	it('checks localized short names after default-locale fallback', async ({ root }) => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.short_name = '__MSG_extensionName__';
		await writeFile(path, JSON.stringify(manifest));
		await writeFile(join(root, 'src/assets/_locales/bg/messages.json'), '{}');
		await expect(packageExtension(root)).rejects.toThrow(
			'short_name must be 1..12 characters in bg'
		);
	});

	it('allows missing translations to fall back to the default locale', async ({ root }) => {
		await writeFile(join(root, 'src/assets/_locales/ja/messages.json'), '{}');
		await expect(packageExtension(root)).resolves.toBeUndefined();
	});

	it('rejects missing messages in the default locale', async ({ root }) => {
		await writeFile(join(root, 'src/assets/_locales/en/messages.json'), '{}');
		await expect(packageExtension(root)).rejects.toThrow('Missing message');
	});

	it.for(['121', '121.0.6167.85'])(
		'takes Chrome %s from the manifest as its build target',
		async (minimum, { root }) => {
			const path = join(root, 'src/assets/manifest.json');
			const manifest = JSON.parse(await readFile(path, 'utf8'));
			manifest.minimum_chrome_version = minimum;
			await writeFile(path, JSON.stringify(manifest));
			await expect(packageExtension(root)).resolves.toBeUndefined();
			expect(esbuild).toHaveBeenCalledWith(expect.objectContaining({ target: 'chrome121' }));
		}
	);

	it('rejects a malformed minimum Chrome version', async ({ root }) => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.minimum_chrome_version = 'not-a-version';
		await writeFile(path, JSON.stringify(manifest));
		await expect(packageExtension(root)).rejects.toThrow('Invalid version');
	});

	it('rejects invalid Chrome version components beyond the build target major', async ({
		root,
	}) => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.minimum_chrome_version = '121.invalid';
		await writeFile(path, JSON.stringify(manifest));
		await expect(packageExtension(root)).rejects.toThrow('Invalid minimum Chrome version');
	});

	it('watches optimized assets and source changes using the same build settings', async ({
		root,
	}) => {
		const log = vi.fn();
		const stop = await watchExtension({ root }, log);
		try {
			const manifestSource = join(root, 'src/assets/manifest.json');
			const manifest = JSON.parse(await readFile(manifestSource, 'utf8'));
			manifest.description = 'Watch test description';
			const rawManifest = `${JSON.stringify(manifest, null, '\t')}\n`;
			await writeFile(manifestSource, rawManifest);
			await vi.waitFor(
				async () =>
					expect(await readFile(join(root, 'dist/manifest.json'), 'utf8')).toBe(
						JSON.stringify(manifest)
					),
				{ timeout: 5000 }
			);
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
			expect(await readFile(manifestSource, 'utf8')).toBe(rawManifest);
			await expect(validateExtension(join(root, 'dist'))).resolves.toBeUndefined();
		} finally {
			await stop();
		}
		const directory = join(root, 'dist');
		const watched = new Map<string, Buffer>();
		for (const file of await collectFiles(directory)) {
			watched.set(relative(directory, file), await readFile(file));
		}
		await buildExtension({ root });
		expect(
			(await collectFiles(directory)).map((file) => relative(directory, file)).sort()
		).toEqual([...watched.keys()].sort());
		for (const [name, data] of watched) {
			expect(await readFile(join(directory, name))).toEqual(data);
		}
		expect(log).not.toHaveBeenCalled();
	}, 15000);
});

it.each(['', '01.2', '1.2.3.4.5', '65536', '0.0.0', '1.0-beta', null])(
	'rejects invalid version %s',
	(version) => {
		expect(() => validateVersion(version)).toThrow();
	}
);
it.each(['1', '0.1', '1.4.10', '65535.65535.65535.65535'])('accepts version %s', (version) => {
	expect(validateVersion(version)).toBe(version);
});
