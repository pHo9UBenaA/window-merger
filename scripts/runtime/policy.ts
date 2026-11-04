import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CODE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => `--allow-fs-read=${path}`;
const write = (path: string) => `--allow-fs-write=${path}`;
const child = '--allow-child-process';
const temporary = (prefix: string) => join(tmpdir(), `${prefix}*`);

type OperationPolicy = { readonly file: string; readonly flags: readonly string[] };
export const operationPolicies = (root: string): Readonly<Record<string, OperationPolicy>> => {
	const dist = join(root, 'dist');
	const release = temporary('window-merger-release-');
	const chrome = join(process.env.RUNNER_TEMP ?? tmpdir(), 'window-merger-chrome-install-*');
	const hashes = temporary('window-merger-chrome-hash-');
	const snapshot = join(root, '.window-merger-index-*');
	return {
		'build-assets': { file: 'build-assets', flags: [read(dist), write(dist)] },
		bundle: { file: 'bundle', flags: [read(join(CODE_ROOT, 'node_modules')), child] },
		archive: {
			file: 'archive',
			flags: [
				read(join(root, 'dist.zip')),
				read(join(root, 'dist.tmp.zip')),
				write(join(root, 'dist.zip')),
				write(join(root, 'dist.tmp.zip')),
				child,
			],
		},
		'pnpm-report': { file: 'pnpm-report', flags: [child] },
		'git-read': { file: 'git-read', flags: [child] },
		'check-tools': { file: 'check-tools', flags: [child] },
		snapshot: { file: 'snapshot', flags: [read(snapshot), write(snapshot)] },
		'export-index': { file: 'export-index', flags: [child] },
		'write-manifest': {
			file: 'write-manifest',
			flags: [
				read(join(root, 'src/assets/manifest.json')),
				write(join(root, 'src/assets/manifest.json')),
			],
		},
		'chrome-download': {
			file: 'chrome-download',
			flags: [read(chrome), write(chrome), read(hashes), write(hashes)],
		},
		'chrome-extract': {
			file: 'chrome-extract',
			flags: [
				read(chrome),
				write(chrome),
				read(join(root, 'test/browser/chrome-versions.json')),
				read(join(root, 'test/browser/chrome-checksums.json')),
				child,
			],
		},
		'chrome-lock': {
			file: 'chrome-lock',
			flags: [
				write(join(root, 'test/browser/chrome-checksums.json')),
				write(join(root, 'test/browser/chrome-versions.json')),
			],
		},
		'chrome-environment': {
			file: 'chrome-environment',
			flags: process.env.GITHUB_ENV ? [write(resolve(process.env.GITHUB_ENV))] : [],
		},
		'release-directory': { file: 'release-directory', flags: [read(release), write(release)] },
		'release-git': { file: 'release-git', flags: [child] },
		'release-pnpm': { file: 'release-pnpm', flags: [child] },
	};
};

type TaskPolicy = { readonly reads: readonly string[]; readonly operations: readonly string[] };
const buildOperations = ['build-assets', 'bundle'];
const gitOperations = ['git-read'];
export const taskPolicies = (root: string): Readonly<Record<string, TaskPolicy>> => ({
	build: { reads: [join(root, 'src'), join(root, 'LICENSE')], operations: buildOperations },
	package: {
		reads: [join(root, 'src'), join(root, 'LICENSE'), join(root, 'dist')],
		operations: [...buildOperations, 'archive'],
	},
	'check-dependencies': { reads: [], operations: ['pnpm-report'] },
	'check-secrets': { reads: [], operations: [...gitOperations, 'check-tools'] },
	'chrome-install': {
		reads: [join(root, 'src/assets/manifest.json'), join(root, 'test/browser')],
		operations: ['chrome-download', 'chrome-extract', 'chrome-environment'],
	},
	'chrome-update': {
		reads: [join(root, 'src/assets/manifest.json'), join(root, 'test/browser')],
		operations: ['chrome-download', 'chrome-lock'],
	},
	'chrome-matrix': {
		reads: [
			join(root, 'src/assets/manifest.json'),
			join(root, 'test/browser/chrome-versions.json'),
		],
		operations: [],
	},
	'release-check': { reads: [], operations: gitOperations },
	'pre-commit': {
		reads: [],
		operations: [...gitOperations, 'snapshot', 'export-index', 'check-tools'],
	},
	'pre-push': { reads: [], operations: gitOperations },
	release: {
		reads: [],
		operations: [...gitOperations, 'release-directory', 'release-git', 'release-pnpm'],
	},
	'sync-version': {
		reads: [join(root, 'src/assets/manifest.json')],
		operations: ['write-manifest'],
	},
});

export const codePermissions = [
	'--permission',
	read(join(CODE_ROOT, 'package.json')),
	read(join(CODE_ROOT, 'scripts')),
];
export const taskPermissions = (root: string, policy: TaskPolicy) => [
	...codePermissions,
	read(join(root, 'package.json')),
	...policy.reads.map(read),
];
