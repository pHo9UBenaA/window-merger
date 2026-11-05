import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { generateFiles, parseConfig } from '../../scripts/generate-commands';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { fixtureEnvironment } from '../helpers/fixture-command';

it('replaces package commands without losing metadata and generates only requested launchers', () => {
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
