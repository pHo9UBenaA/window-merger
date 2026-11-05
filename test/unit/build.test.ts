import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExtension } from '../../scripts/build/main';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { validateExtension } from '../../scripts/lib/validate-extension';
import { useOperationRoot } from '../helpers/script-operations';

vi.mock('../../scripts/lib/run-node', async () => ({
	runNode: (await import('../helpers/script-operations')).runScript,
}));
vi.mock('esbuild', async (importOriginal) => {
	const original = await importOriginal<typeof import('esbuild')>();
	return { ...original, build: vi.fn(original.build) };
});

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'window-merger-build-'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe('build output', () => {
	beforeEach(async () => {
		await cp(join(PROJECT_ROOT, 'src'), join(root, 'src'), { recursive: true });
		await cp(join(PROJECT_ROOT, 'LICENSE'), join(root, 'LICENSE'));
		useOperationRoot(root);
	});
	it('does not retain assets deleted between builds', async () => {
		const obsolete = join(root, 'src/assets/obsolete.txt');
		await writeFile(obsolete, 'old');
		await buildExtension({ root });
		await rm(obsolete);
		await buildExtension({ root });
		await expect(readFile(join(root, 'dist/obsolete.txt'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it('compacts JSON and removes translator guidance without changing runtime messages or source', async () => {
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
		await buildExtension({ root });
		const compact = await readFile(join(root, 'dist/_locales/en/messages.json'), 'utf8');
		expect(compact).toBe(JSON.stringify(JSON.parse(compact)));
		expect(JSON.parse(compact)).toMatchObject({
			greeting: {
				message: 'Hello $NAME$ $DESCRIPTION$',
				placeholders: {
					name: { content: '$1', example: 'Alice' },
					description: { content: '$2', example: 'world' },
				},
			},
			description: { message: 'Description label' },
		});
		expect(JSON.parse(compact).greeting).not.toHaveProperty('description');
		expect(JSON.parse(compact).description).not.toHaveProperty('description');
		expect(await readFile(source, 'utf8')).toBe(original);
		const manifest = await readFile(join(root, 'src/assets/manifest.json'), 'utf8');
		expect(await readFile(join(root, 'dist/manifest.json'), 'utf8')).toBe(
			JSON.stringify(JSON.parse(manifest))
		);
	});

	it('uses the manifest Chrome major and supports readable development output', async () => {
		const path = join(root, 'src/assets/manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.minimum_chrome_version = '121.0.6167.85';
		await writeFile(path, JSON.stringify(manifest));
		await buildExtension({ root, minify: false });
		expect(esbuild).toHaveBeenCalledWith(
			expect.objectContaining({ target: 'chrome121', minify: false })
		);
	});
});

describe('extension validation', () => {
	let directory: string;
	beforeEach(async () => {
		directory = join(root, 'dist');
		await cp(join(PROJECT_ROOT, 'src/assets'), directory, { recursive: true });
		await writeFile(join(directory, 'background.js'), '');
	});
	const changeManifest = async (changes: Record<string, unknown>) => {
		const path = join(directory, 'manifest.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		await writeFile(path, JSON.stringify({ ...manifest, ...changes }));
	};

	it.each(['../outside.js', '/outside.js'])(
		'rejects a manifest asset outside the output directory: %s',
		async (service_worker) => {
			await changeManifest({ background: { service_worker } });
			await expect(validateExtension(directory)).rejects.toThrow('Invalid asset path');
		}
	);

	it('rejects an icon whose dimensions do not match its declaration', async () => {
		await changeManifest({ action: { default_icon: { '24': 'icon-16.png' } } });
		await expect(validateExtension(directory)).rejects.toThrow(
			'Icon dimensions do not match 24'
		);
	});

	it('rejects a non-PNG icon', async () => {
		await writeFile(join(directory, 'icon-128.png'), 'not a PNG');
		await expect(validateExtension(directory)).rejects.toThrow('Expected PNG icon');
	});

	it('requires the Chrome Web Store 128px icon', async () => {
		await changeManifest({ icons: { '16': 'icon-16.png' } });
		await expect(validateExtension(directory)).rejects.toThrow('Missing 128px');
	});

	it('supports a single action icon path', async () => {
		await changeManifest({ action: { default_icon: 'icon-32.png' } });
		await expect(validateExtension(directory)).resolves.toBeUndefined();
	});

	it.each([
		['name', 75],
		['description', 132],
		['short_name', 12],
	] as const)('checks the manifest %s length', async (key, maximum) => {
		await changeManifest({ [key]: 'x'.repeat(maximum) });
		await expect(validateExtension(directory)).resolves.toBeUndefined();
		await changeManifest({ [key]: 'x'.repeat(maximum + 1) });
		await expect(validateExtension(directory)).rejects.toThrow(`Localized manifest ${key}`);
	});

	it('checks localized short names after default-locale fallback', async () => {
		await changeManifest({ short_name: '__MSG_extensionName__' });
		await writeFile(join(directory, '_locales/bg/messages.json'), '{}');
		await expect(validateExtension(directory)).rejects.toThrow(
			'short_name must be 1..12 characters in bg'
		);
	});

	it('allows missing translations to fall back to the default locale', async () => {
		await writeFile(join(directory, '_locales/ja/messages.json'), '{}');
		await expect(validateExtension(directory)).resolves.toBeUndefined();
	});

	it('rejects missing default-locale messages', async () => {
		await writeFile(join(directory, '_locales/en/messages.json'), '{}');
		await expect(validateExtension(directory)).rejects.toThrow('Missing message');
	});

	it('rejects invalid Chrome components beyond the build target major', async () => {
		await changeManifest({ minimum_chrome_version: '121.invalid' });
		await expect(validateExtension(directory)).rejects.toThrow(
			'Invalid minimum Chrome version'
		);
	});
});
