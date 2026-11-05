import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildExtension } from '../../scripts/build/main';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { validateExtension } from '../../scripts/lib/validate-extension';

let root: string;
beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-build-')));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

it('compacts assets without losing messages or modifying source, with readable development JavaScript', async () => {
	await cp(join(PROJECT_ROOT, 'src'), join(root, 'src'), { recursive: true });
	await cp(join(PROJECT_ROOT, 'LICENSE'), join(root, 'LICENSE'));
	const source = join(root, 'src/assets/_locales/en/messages.json');
	const messages = JSON.parse(await readFile(source, 'utf8'));
	const greeting = {
		message: 'Hello $NAME$ $DESCRIPTION$',
		placeholders: {
			name: { content: '$1', example: 'Alice' },
			description: { content: '$2', example: 'world' },
		},
	};
	messages.greeting = { ...greeting, description: 'Translator guidance' };
	messages.description = { message: 'Description label', description: 'Translator guidance' };
	const original = `${JSON.stringify(messages, null, '\t')}\n`;
	await writeFile(source, original);
	buildExtension({ root, minify: false });
	const compact = await readFile(join(root, 'dist/_locales/en/messages.json'), 'utf8');
	const output = JSON.parse(compact);
	expect(compact).toBe(JSON.stringify(output));
	expect(output.greeting).toEqual(greeting);
	expect(output.description).toEqual({ message: 'Description label' });
	expect(await readFile(source, 'utf8')).toBe(original);
	const manifest = await readFile(join(root, 'src/assets/manifest.json'), 'utf8');
	expect(await readFile(join(root, 'dist/manifest.json'), 'utf8')).toBe(
		JSON.stringify(JSON.parse(manifest))
	);
	expect(
		(await readFile(join(root, 'dist/background.js'), 'utf8')).split('\n').length
	).toBeGreaterThan(3);
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
		await writeFile(
			path,
			JSON.stringify({ ...JSON.parse(await readFile(path, 'utf8')), ...changes })
		);
	};

	it('rejects a manifest asset outside the output directory', async () => {
		await changeManifest({ background: { service_worker: '../outside.js' } });
		await expect(validateExtension(directory)).rejects.toThrow('Invalid asset path');
	});

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

	it('checks description limits after localization and default-locale fallback', async () => {
		const description = { extensionDescription: { message: 'x'.repeat(132) } };
		const english = join(directory, '_locales/en/messages.json');
		await writeFile(
			english,
			JSON.stringify({ ...JSON.parse(await readFile(english, 'utf8')), ...description })
		);
		const japanese = join(directory, '_locales/ja/messages.json');
		await writeFile(japanese, '{}');
		await expect(validateExtension(directory)).resolves.toBeUndefined();
		await writeFile(
			japanese,
			JSON.stringify({ extensionDescription: { message: 'x'.repeat(133) } })
		);
		await expect(validateExtension(directory)).rejects.toThrow(
			'Localized manifest description'
		);
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
