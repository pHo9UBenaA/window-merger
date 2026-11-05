import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkDependencies, type DependencyReports } from '../../scripts/check-dependencies/check';
import { collectReports } from '../../scripts/check-dependencies/collect';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
const spawn = vi.mocked(spawnSync);
const api = vi.fn<typeof fetch>();
const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const pnpmCounts = (vulnerabilities: unknown) => ({
	metadata: { vulnerabilities },
	advisories: {},
});
const cleanPnpm = pnpmCounts(counts);
const dependency = { from: 'example', version: '1.0.0' };
const packageList = [
	{
		name: 'private-project',
		path: '/private/source',
		private: true,
		devDependencies: {
			example: {
				...dependency,
				path: '/private/node_modules/example',
				resolved: 'https://user:secret@registry.invalid/example.tgz',
			},
		},
	},
];
const query = { package: { ecosystem: 'npm', name: 'example' }, version: '1.0.0' };
const result = (report: unknown, status = 0): DependencyReports['audit'] => ({
	status,
	signal: null,
	stdout: JSON.stringify(report),
	stderr: '',
});
const check = (audit = result(cleanPnpm), list = result(packageList)) =>
	checkDependencies({ audit, list });
const requestBody = (index = 0) => JSON.parse(String(api.mock.calls[index][1]?.body));

beforeEach(() => {
	vi.stubEnv('npm_execpath', '/tools/pnpm-native');
	vi.stubGlobal('fetch', api);
	api.mockImplementation(async () => Response.json({ results: [{}] }));
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it('collects locked pnpm reports and sends only package identities to the fixed HTTPS API', async () => {
	const processResult = (data: unknown): SpawnSyncReturns<string> => ({
		status: 0,
		signal: null,
		pid: 1,
		stdout: JSON.stringify(data),
		stderr: '',
		output: [],
	});
	spawn.mockImplementation((_executable, args) =>
		processResult(args?.[0] === 'audit' ? cleanPnpm : packageList)
	);
	expect(await checkDependencies(collectReports())).toBe(0);
	expect(spawn).toHaveBeenCalledWith(
		'/tools/pnpm-native',
		['audit', '--json'],
		expect.any(Object)
	);
	expect(spawn).toHaveBeenCalledWith(
		'/tools/pnpm-native',
		['list', '--lockfile-only', '--depth', 'Infinity', '--json'],
		expect.any(Object)
	);
	expect(api).toHaveBeenCalledExactlyOnceWith('https://api.osv.dev/v1/querybatch', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ queries: [query] }),
		redirect: 'error',
		credentials: 'omit',
		signal: expect.any(AbortSignal),
	});
});

it('includes transitive, development and optional dependencies and deduplicates resolved aliases', async () => {
	const list = [
		{
			dependencies: {
				alias: {
					from: '@scope/real',
					version: '2.0.0',
					dependencies: { child: { version: '3.0.0' } },
				},
			},
			devDependencies: { duplicate: { from: '@scope/real', version: '2.0.0' } },
			optionalDependencies: { optional: { version: '4.0.0-beta.1+build.2' } },
		},
	];
	api.mockResolvedValueOnce(Response.json({ results: [{}, {}, {}] }));
	expect(await check(result(cleanPnpm), result(list))).toBe(0);
	const queries = requestBody().queries;
	expect(queries).toHaveLength(3);
	expect(queries).toEqual(
		expect.arrayContaining([
			{ package: { ecosystem: 'npm', name: '@scope/real' }, version: '2.0.0' },
			{ package: { ecosystem: 'npm', name: 'optional' }, version: '4.0.0-beta.1+build.2' },
			{ package: { ecosystem: 'npm', name: 'child' }, version: '3.0.0' },
		])
	);
});

it('queries every package in a large dependency list under one deadline', async () => {
	const dependencies = Object.fromEntries(
		Array.from({ length: 101 }, (_, index) => [`pkg-${index}`, { version: '1.0.0' }])
	);
	api.mockImplementation(async (_url, options) => {
		const { queries } = JSON.parse(String(options?.body));
		return Response.json({ results: queries.map(() => ({})) });
	});
	expect(await check(result(cleanPnpm), result([{ dependencies }]))).toBe(0);
	const queries = api.mock.calls.flatMap((_, index) => requestBody(index).queries);
	expect(queries).toHaveLength(101);
	expect(queries).toEqual(
		expect.arrayContaining(
			Object.keys(dependencies).map((name) => ({
				package: { ecosystem: 'npm', name },
				version: '1.0.0',
			}))
		)
	);
	const deadline = api.mock.calls[0][1]?.signal;
	for (const [, options] of api.mock.calls) expect(options?.signal).toBe(deadline);
});

it('reports paginated findings without re-querying completed packages or duplicating IDs', async () => {
	api.mockResolvedValueOnce(
		Response.json({ results: [{ vulns: [{ id: 'OSV-1' }], next_page_token: 'next' }, {}] })
	).mockResolvedValueOnce(
		Response.json({ results: [{ vulns: [{ id: 'OSV-1' }, { id: 'OSV-2' }] }] })
	);
	expect(
		await check(
			result(cleanPnpm),
			result([{ dependencies: { example: dependency, other: { version: '2.0.0' } } }])
		)
	).toBe(1);
	expect(requestBody(1)).toEqual({ queries: [{ ...query, page_token: 'next' }] });
	expect(console.log).toHaveBeenCalledWith('Found 2 vulnerability entries.');
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-2');
});

it.each([
	['missing query results', { results: [] }],
	['query failure', { results: [{ error: 'failure' }] }],
	['unidentified finding', { results: [{ vulns: [{}] }] }],
])('does not report OSV %s as a clean audit', async (_name, report) => {
	api.mockResolvedValueOnce(Response.json(report));
	expect(await check()).toBe(2);
});

it('stops repeated pagination tokens rather than looping or silently truncating', async () => {
	api.mockImplementation(async () => Response.json({ results: [{ next_page_token: 'same' }] }));
	expect(await check()).toBe(2);
	expect(api).toHaveBeenCalledTimes(2);
});

it('bounds pagination even when the server keeps returning new tokens', async () => {
	api.mockImplementation(async () => {
		if (api.mock.calls.length > 200) throw new Error('Pagination never stopped');
		return Response.json({ results: [{ next_page_token: `page-${api.mock.calls.length}` }] });
	});
	expect(await check()).toBe(2);
	expect(api.mock.calls.length).toBeLessThan(200);
});

it('fails closed on an HTTP server error', async () => {
	api.mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 500 }));
	expect(await check()).toBe(2);
});

it.each([
	['non-JSON content', () => new Response('<html>error</html>')],
	['invalid JSON', () => new Response('{', { headers: { 'Content-Type': 'application/json' } })],
	[
		'oversized response',
		() =>
			new Response(' '.repeat(4 * 1024 * 1024 + 1), {
				headers: { 'Content-Type': 'application/json' },
			}),
	],
])('fails closed for %s', async (_name, response) => {
	api.mockResolvedValueOnce(response());
	expect(await check()).toBe(2);
});

it.each([
	['no packages', [{}]],
	['a local dependency', [{ dependencies: { example: { version: 'link:../private' } } }]],
	[
		'a private URL instead of a package name',
		[
			{
				dependencies: {
					example: { from: 'https://user:secret@private.invalid/', version: '1.0.0' },
				},
			},
		],
	],
])('rejects %s before contacting OSV', async (_name, list) => {
	expect(await check(result(cleanPnpm), result(list))).toBe(2);
	expect(api).not.toHaveBeenCalled();
});

it('reports a missing pnpm list executable as an incomplete audit', async () => {
	expect(
		await check(result(cleanPnpm), {
			...result(null),
			status: null,
			error: 'spawn pnpm ENOENT',
		})
	).toBe(2);
	expect(api).not.toHaveBeenCalled();
});

it('rejects a failed package listing even if it returned valid JSON', async () => {
	expect(await check(result(cleanPnpm), result(packageList, 1))).toBe(2);
	expect(api).not.toHaveBeenCalled();
});

it('rejects truncated subprocess JSON and sanitizes stderr', async () => {
	expect(
		await check(result(cleanPnpm), {
			...result(null),
			stdout: '{',
			stderr: 'Failure\n\x1b[31mdetail\x1b[0m',
		})
	).toBe(2);
	expect(console.error).toHaveBeenCalledWith('Failure\\u{a}detail');
});

it('fails for low-severity pnpm counts even without advisory details', async () => {
	expect(await check(result(pnpmCounts({ ...counts, low: 1 })))).toBe(1);
});

it('reports pnpm advisories even when metadata claims success and escapes untrusted log text', async () => {
	expect(
		await check(
			result({
				...cleanPnpm,
				advisories: {
					'1': {
						module_name: 'example',
						title: 'Unsafe \x1b[31mcode\x1b[0m\nnext\u202e::error::spoof',
					},
				},
			})
		)
	).toBe(1);
	expect(console.log).toHaveBeenCalledWith(
		'  - example: Unsafe code\\u{a}next\\u{202e}\\u{3a}\\u{3a}error\\u{3a}\\u{3a}spoof'
	);
});

it.each([
	['an unsupported npm format', { metadata: { vulnerabilities: counts }, vulnerabilities: {} }],
	['non-numeric counts', pnpmCounts({ ...counts, high: '0' })],
])('does not accept pnpm reports with %s as clean', async (_name, report) => {
	expect(await check(result(report))).toBe(2);
});

it('does not accept pnpm audit exit 1 without recognized findings', async () => {
	expect(await check(result(cleanPnpm, 1))).toBe(2);
});

it('still reports OSV findings when pnpm audit fails, without hiding the incomplete audit', async () => {
	api.mockResolvedValueOnce(Response.json({ results: [{ vulns: [{ id: 'OSV-1' }] }] }));
	expect(await check(result({}, 2))).toBe(2);
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-1');
});

it('gives an OSV network timeout precedence over pnpm findings', async () => {
	api.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
	expect(await check(result(pnpmCounts({ ...counts, high: 1 })))).toBe(2);
});

it('requires the pnpm entry point without downloading tools', () => {
	vi.stubEnv('npm_execpath', undefined);
	expect(() => collectReports()).toThrow('Run this check via pnpm check:dependencies');
	expect(spawn).not.toHaveBeenCalled();
});
