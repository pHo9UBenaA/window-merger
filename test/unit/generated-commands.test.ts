import { expect, it } from 'vitest';
import { generateFiles, parseConfig, shellCommand } from '../../scripts/generate-commands';

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

it.each(['../outside.ts', 'example/read.ts;echo unsafe'])(
	'rejects an executable outside the declared directory structure: %s',
	(file) => {
		expect(() =>
			parseConfig({ executables: { example: { file } }, packageScripts: {} })
		).toThrow('Invalid executable path');
	}
);

it('leaves environment-dependent paths to the generated arguments used by dedicated scripts', () => {
	const { executables } = parseConfig({
		executables: { download: { file: 'lib/download.ts', write: ['$tmp/download-*'] } },
		packageScripts: {},
	});
	expect(() => shellCommand(executables.download)).toThrow(
		'Dynamic paths require a dedicated command script'
	);
});

it.each(['../outside', 'dist;echo unsafe', '$unknown/file'])(
	'rejects unsafe permission paths: %s',
	(path) => {
		const fixture = parseConfig({
			executables: { example: { file: 'example/main.ts', write: [path] } },
			packageScripts: {},
		});
		expect(() => generateFiles(fixture, '{}')).toThrow();
	}
);
