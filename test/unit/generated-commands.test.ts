import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { generateFiles, parseConfig } from '../../scripts/generate-commands';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { fixtureEnvironment } from '../helpers/fixture-command';

it('preserves package metadata and command order, and generates only requested launchers', () => {
	const config = parseConfig({
		executables: {
			read: { file: 'example/read.ts', launcher: true },
			write: { file: 'example/write.ts' },
			other: { file: 'other/main.ts' },
		},
		packageScripts: { write: '{{write}}', other: '{{other}}' },
	});
	const files = generateFiles(
		config,
		'{"name":"fixture","version":"1.0.0","scripts":{"obsolete":"old"}}'
	);
	expect([...files.keys()]).toEqual(['package.json', 'scripts/example/commands.generated.ts']);
	const launchers = files.get('scripts/example/commands.generated.ts');
	expect(launchers).toContain('export const readCommand');
	expect(launchers).not.toContain('writeCommand');
	const pkg = JSON.parse(files.get('package.json') ?? 'null');
	expect(pkg).toMatchObject({ name: 'fixture', version: '1.0.0' });
	expect(Object.keys(pkg.scripts)).toEqual(['write', 'other']);
	expect(pkg.scripts.write).toContain('./scripts/example/write.ts');
	expect(pkg.scripts.other).toContain('./scripts/other/main.ts');
});

it('uses Biome to reject and fix unsorted command definitions before generation', () => {
	const source = `${JSON.stringify(
		{
			executables: {},
			packageScripts: { test: 'vitest run', 'check:secrets': 'secrets', check: 'check' },
		},
		null,
		'\t'
	)}\n`;
	const check = (flags: readonly string[]) =>
		spawnSync(
			process.execPath,
			[
				join(PROJECT_ROOT, 'node_modules/@biomejs/biome/bin/biome'),
				'check',
				'--stdin-file-path=scripts/commands.json',
				...flags,
			],
			{ cwd: PROJECT_ROOT, env: fixtureEnvironment(), input: source, encoding: 'utf8' }
		);
	expect(check([]).status).toBe(1);
	const fixed = check(['--write']);
	expect(fixed.status, fixed.stderr).toBe(0);
	const files = generateFiles(parseConfig(JSON.parse(fixed.stdout)), '{}');
	const pkg = JSON.parse(files.get('package.json') ?? 'null');
	expect(Object.keys(pkg.scripts)).toEqual(['check', 'check:secrets', 'test']);
});

it('accepts Biome lifecycle ordering but rejects changed command contents', async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-generator-')));
	try {
		await mkdir(join(root, 'scripts/lib'), { recursive: true });
		for (const path of ['generate-commands.ts', 'lib/input.ts', 'lib/project-root.ts'])
			await copyFile(join(PROJECT_ROOT, 'scripts', path), join(root, 'scripts', path));
		const config = {
			executables: {},
			packageScripts: { pretest: 'prepare', 'release:check': 'release', test: 'vitest run' },
		};
		await writeFile(join(root, 'scripts/commands.json'), JSON.stringify(config));
		const generated = generateFiles(parseConfig(config), '{"type":"module"}');
		const formatted = spawnSync(
			process.execPath,
			[
				join(PROJECT_ROOT, 'node_modules/@biomejs/biome/bin/biome'),
				'check',
				'--write',
				'--stdin-file-path=package.json',
			],
			{
				cwd: PROJECT_ROOT,
				env: fixtureEnvironment(),
				input: generated.get('package.json'),
				encoding: 'utf8',
			}
		);
		expect(formatted.status, formatted.stderr).toBe(0);
		const pkg = JSON.parse(formatted.stdout);
		expect(Object.keys(pkg.scripts)).toEqual(['release:check', 'pretest', 'test']);
		await writeFile(join(root, 'package.json'), formatted.stdout);
		const check = () =>
			spawnSync(
				process.execPath,
				[
					'--permission',
					`--allow-fs-read=${root}`,
					join(root, 'scripts/generate-commands.ts'),
					'--check',
				],
				{ cwd: root, env: fixtureEnvironment(), encoding: 'utf8' }
			);
		const current = check();
		expect(current.status, current.stderr).toBe(0);
		await writeFile(
			join(root, 'package.json'),
			JSON.stringify({ ...pkg, scripts: { ...pkg.scripts, test: 'outdated command' } })
		);
		const stale = check();
		expect(stale.status).toBe(1);
		expect(stale.stderr).toContain('package.json is stale');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it.each([{ file: '../outside.ts' }, { file: 'example/read.ts', write: ['dist;echo unsafe'] }])(
	'rejects unsafe executable or permission paths: %j',
	(entry) => {
		expect(() =>
			parseConfig({ executables: { example: entry }, packageScripts: {} })
		).toThrow();
	}
);

it('rejects orphaned generated modules when checking commands', async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'window-merger-generator-')));
	try {
		await mkdir(join(root, 'scripts/lib'), { recursive: true });
		await mkdir(join(root, 'scripts/obsolete'));
		for (const path of ['generate-commands.ts', 'lib/input.ts', 'lib/project-root.ts'])
			await copyFile(join(PROJECT_ROOT, 'scripts', path), join(root, 'scripts', path));
		await writeFile(join(root, 'package.json'), '{"type":"module","scripts":{}}');
		await writeFile(
			join(root, 'scripts/commands.json'),
			'{"executables":{},"packageScripts":{}}'
		);
		await writeFile(join(root, 'scripts/obsolete/commands.generated.ts'), '');
		const result = spawnSync(
			process.execPath,
			[
				'--permission',
				`--allow-fs-read=${root}`,
				join(root, 'scripts/generate-commands.ts'),
				'--check',
			],
			{ cwd: root, env: fixtureEnvironment(), encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(1);
		expect(result.stderr).toContain('scripts/obsolete/commands.generated.ts is obsolete');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
