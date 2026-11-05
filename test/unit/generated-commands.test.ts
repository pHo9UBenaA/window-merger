import { glob, readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { generateFiles, parseConfig, shellCommand } from '../../scripts/generate-commands';

const configuration = await readFile(
	new URL('../../scripts/commands.json', import.meta.url),
	'utf8'
);
const config = parseConfig(JSON.parse(configuration));

it('keeps the committed package commands and per-command arguments up to date', async () => {
	const pkg = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
	for (const [path, expected] of generateFiles(config, pkg))
		expect(
			(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')).replaceAll(
				'\r\n',
				'\n'
			),
			path
		).toBe(expected);
});

it('declares permissions for every directly executable script', async () => {
	const entries = new Set(Object.values(config.executables).map(({ file }) => `scripts/${file}`));
	for (const path of entries) await readFile(path, 'utf8');
	for await (const path of glob('scripts/**/*.ts')) {
		const source = await readFile(path, 'utf8');
		if (source.includes('if (import.meta.main)'))
			expect(entries.has(path.replaceAll('\\', '/')), path).toBe(true);
	}
});

it('replaces generated commands while preserving package metadata', () => {
	const fixture = parseConfig({
		executables: { read: { file: 'example/read.ts' } },
		packageScripts: { example: '{{read}}' },
	});
	const files = generateFiles(
		fixture,
		'{"name":"fixture","version":"1.0.0","scripts":{"obsolete":"old"}}'
	);
	const pkg = JSON.parse(files.get('package.json') ?? 'null');
	expect(pkg).toEqual({
		name: 'fixture',
		version: '1.0.0',
		scripts: {
			example:
				'node --permission --allow-fs-read=./package.json --allow-fs-read=./scripts --no-allow-child-process ./scripts/example/read.ts',
		},
	});
});

it('rejects undeclared executable names rather than generating a broken command', () => {
	const fixture = parseConfig({ executables: {}, packageScripts: { example: '{{unknown}}' } });
	expect(() => generateFiles(fixture, '{}')).toThrow('Unknown executable');
});

it.each([
	'../outside.ts',
	'example/../../outside.ts',
	'/outside.ts',
	'example/read.ts;echo unsafe',
])('rejects an executable outside the declared directory structure: %s', (file) => {
	expect(() => parseConfig({ executables: { example: { file } }, packageScripts: {} })).toThrow(
		'Invalid executable path'
	);
});

it('leaves environment-dependent paths to the generated arguments used by dedicated scripts', () => {
	const entry = config.executables.chromeDownload;
	expect(() => shellCommand(entry)).toThrow('Dynamic paths require a dedicated command script');
	const files = generateFiles(config, '{"scripts":{}}');
	expect(files.get('scripts/lib/commands.generated.ts')).toContain(
		"join(tmpdir(), 'window-merger-chrome-hash-*')"
	);
});

it.each(['../outside', 'dist;echo unsafe', 'dist/$(unsafe)', '$unknown/file'])(
	'rejects unsafe permission paths: %s',
	(path) => {
		const fixture = parseConfig({
			executables: { example: { file: 'example/main.ts', write: [path] } },
			packageScripts: {},
		});
		expect(() => generateFiles(fixture, '{}')).toThrow();
	}
);
