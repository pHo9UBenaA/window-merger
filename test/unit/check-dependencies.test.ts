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
	expect(api).toHaveBeenCalledWith(
		'https://api.osv.dev/v1/querybatch',
		expect.objectContaining({
			method: 'POST',
			body: JSON.stringify({ queries: [query] }),
			redirect: 'error',
		})
	);
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

it('queries all packages across multiple batches', async () => {
	const dependencies = Object.fromEntries(
		Array.from({ length: 101 }, (_, index) => [`pkg-${index}`, { version: '1.0.0' }])
	);
	api.mockImplementation(async (_url, options) => {
		const { queries } = JSON.parse(String(options?.body));
		return Response.json({ results: queries.map(() => ({})) });
	});
	expect(await check(result(cleanPnpm), result([{ dependencies }]))).toBe(0);
	const queries = api.mock.calls.flatMap((_, index) => requestBody(index).queries);
	expect(
		queries.map((query: { package: { name: string } }) => query.package.name).toSorted()
	).toEqual(Object.keys(dependencies).toSorted());
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
])('does not report OSV %s as a clean audit', async (_name, report) => {
	api.mockResolvedValueOnce(Response.json(report));
	expect(await check()).toBe(2);
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

it('bounds response size instead of buffering an unbounded API body', async () => {
	api.mockResolvedValueOnce(
		Response.json({ results: [{}], padding: 'x'.repeat(4 * 1024 * 1024) })
	);
	expect(await check()).toBe(2);
});

it('rejects private dependency URLs before contacting OSV', async () => {
	const list = [
		{
			dependencies: {
				example: { from: 'https://user:secret@private.invalid/', version: '1.0.0' },
			},
		},
	];
	expect(await check(result(cleanPnpm), result(list))).toBe(2);
	expect(api).not.toHaveBeenCalled();
});

it('rejects a failed package listing even if it returned valid JSON', async () => {
	expect(await check(result(cleanPnpm), result(packageList, 1))).toBe(2);
	expect(api).not.toHaveBeenCalled();
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

it('does not treat an unsupported audit format as a clean report', async () => {
	expect(
		await check(result({ metadata: { vulnerabilities: counts }, vulnerabilities: {} }))
	).toBe(2);
});

it('does not accept pnpm audit exit 1 without recognized findings', async () => {
	expect(await check(result(cleanPnpm, 1))).toBe(2);
});

it('still reports OSV findings when pnpm audit fails, without hiding the incomplete audit', async () => {
	api.mockResolvedValueOnce(Response.json({ results: [{ vulns: [{ id: 'OSV-1' }] }] }));
	expect(await check({ ...result({}, 2), stderr: 'Failure\n\x1b[31mdetail\x1b[0m' })).toBe(2);
	expect(console.error).toHaveBeenCalledWith('Failure\\u{a}detail');
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-1');
});
