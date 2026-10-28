import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkDependencies } from '../../scripts/check-dependencies';

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
const result = (report: unknown, status = 0): SpawnSyncReturns<string> => ({
	status,
	signal: null,
	error: undefined,
	stdout: JSON.stringify(report),
	stderr: '',
	pid: 1,
	output: [null, JSON.stringify(report), ''],
});
const check = (pnpm = result(cleanPnpm), list = result(packageList)) => {
	spawn.mockReturnValueOnce(pnpm).mockReturnValueOnce(list);
	return checkDependencies();
};
const requestBody = (index = 0) => JSON.parse(String(api.mock.calls[index][1]?.body));

beforeEach(() => {
	vi.stubEnv('npm_execpath', '/tools/pnpm.cjs');
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

it('queries the fixed HTTPS API with only locked package identities, never project paths or credentials', async () => {
	const timeout = vi.spyOn(AbortSignal, 'timeout');
	expect(await check()).toBe(0);
	expect(spawn.mock.calls).toEqual([
		[
			process.execPath,
			['/tools/pnpm.cjs', 'audit', '--json'],
			expect.objectContaining({ timeout: 60000, encoding: 'utf8' }),
		],
		[
			process.execPath,
			['/tools/pnpm.cjs', 'list', '--lockfile-only', '--depth', 'Infinity', '--json'],
			expect.any(Object),
		],
	]);
	expect(api).toHaveBeenCalledExactlyOnceWith('https://api.osv.dev/v1/querybatch', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ queries: [query] }),
		redirect: 'error',
		credentials: 'omit',
		signal: expect.any(AbortSignal),
	});
	expect(timeout).toHaveBeenCalledWith(60000);
});

it('includes transitive, development and optional dependencies and resolves aliases, deduplicating identities', async () => {
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
	expect(requestBody()).toEqual({
		queries: [
			{ package: { ecosystem: 'npm', name: '@scope/real' }, version: '2.0.0' },
			{ package: { ecosystem: 'npm', name: 'optional' }, version: '4.0.0-beta.1+build.2' },
			{ package: { ecosystem: 'npm', name: 'child' }, version: '3.0.0' },
		],
	});
});

it('uses sequential batches of at most 100 packages with a shared audit timeout', async () => {
	const timeout = vi.spyOn(AbortSignal, 'timeout');
	const dependencies = Object.fromEntries(
		Array.from({ length: 201 }, (_, index) => [`pkg-${index}`, { version: '1.0.0' }])
	);
	api.mockImplementation(async (_url, options) => {
		const { queries } = JSON.parse(String(options?.body));
		return Response.json({ results: queries.map(() => ({})) });
	});
	expect(await check(result(cleanPnpm), result([{ dependencies }]))).toBe(0);
	expect(api).toHaveBeenCalledTimes(3);
	expect([0, 1, 2].map((index) => requestBody(index).queries.length)).toEqual([100, 100, 1]);
	expect(timeout).toHaveBeenCalledExactlyOnceWith(60000);
	const firstSignal = api.mock.calls[0][1]?.signal;
	for (const [, options] of api.mock.calls) expect(options?.signal).toBe(firstSignal);
});

it('reports OSV IDs and sanitizes untrusted output', async () => {
	api.mockResolvedValueOnce(
		Response.json({
			results: [
				{
					vulns: [
						{ id: 'OSV-1' },
						{ id: 'Unsafe\x1b[31mcode\x1b[0m\nnext\u202e::error::spoof' },
					],
				},
			],
		})
	);
	expect(await check()).toBe(1);
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-1');
	expect(console.log).toHaveBeenCalledWith(
		'  - example@1.0.0: Unsafecode\\u{a}next\\u{202e}\\u{3a}\\u{3a}error\\u{3a}\\u{3a}spoof'
	);
});

it('follows pagination only for unfinished queries, deduplicating repeated findings', async () => {
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
});

it.each([
	['missing results', {}],
	['null results', { results: null }],
	['wrong results type', { results: {} }],
	['too few results', { results: [] }],
	['too many results', { results: [{}, {}] }],
	['null result', { results: [null] }],
	['query error', { results: [{ error: 'failure' }] }],
	['top-level error', { error: 'failure', results: [{}] }],
	['null vulnerabilities', { results: [{ vulns: null }] }],
	['invalid vulnerabilities', { results: [{ vulns: {} }] }],
	['missing ID', { results: [{ vulns: [{}] }] }],
	['empty ID', { results: [{ vulns: [{ id: '' }] }] }],
	['invalid ID', { results: [{ vulns: [{ id: 1 }] }] }],
	['invalid token', { results: [{ next_page_token: null }] }],
	['oversized token', { results: [{ next_page_token: 'x'.repeat(4097) }] }],
])('rejects OSV %s rather than reporting a clean audit', async (_name, report) => {
	api.mockResolvedValueOnce(Response.json(report));
	expect(await check()).toBe(2);
	expect(console.log).not.toHaveBeenCalledWith('No vulnerabilities found by OSV API.');
});

it('rejects repeated pagination tokens rather than looping or silently truncating', async () => {
	api.mockImplementation(async () => Response.json({ results: [{ next_page_token: 'same' }] }));
	expect(await check()).toBe(2);
	expect(api).toHaveBeenCalledTimes(2);
});

it('stops after 100 pages even when the API keeps returning distinct tokens', async () => {
	api.mockImplementation(async () =>
		Response.json({
			results: [{ next_page_token: `page-${api.mock.calls.length}` }],
		})
	);
	expect(await check()).toBe(2);
	expect(api).toHaveBeenCalledTimes(100);
	expect(console.error).toHaveBeenCalledWith('OSV API: audit incomplete: Too many OSV pages');
});

it('accepts a valid JSON response at the exact 4 MiB size boundary', async () => {
	const body = JSON.stringify({ results: [{}] }).padEnd(4 * 1024 * 1024, ' ');
	api.mockResolvedValueOnce(
		new Response(body, { headers: { 'Content-Type': 'application/json' } })
	);
	expect(await check()).toBe(0);
});

it.each([302, 429, 500])(
	'fails closed on HTTP %s without following redirects or retrying indefinitely',
	async (status) => {
		api.mockResolvedValueOnce(
			new Response('failure', {
				status,
				headers: {
					Location: 'https://untrusted.invalid/',
					'Content-Type': 'application/json',
				},
			})
		);
		expect(await check()).toBe(2);
		expect(api).toHaveBeenCalledTimes(1);
	}
);

it.each([
	['non-JSON content', () => new Response('<html>error</html>')],
	['invalid JSON', () => new Response('{', { headers: { 'Content-Type': 'application/json' } })],
	[
		'oversized body',
		() =>
			new Response(' '.repeat(4 * 1024 * 1024 + 1), {
				headers: { 'Content-Type': 'application/json' },
			}),
	],
	[
		'broken body stream',
		() =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.error(new Error('Stream failed'));
					},
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			),
	],
])('fails closed for %s', async (_name, response) => {
	api.mockResolvedValueOnce(response());
	expect(await check()).toBe(2);
});

it.each([new Error('Network failed'), new DOMException('Timed out', 'TimeoutError')])(
	'fails closed on network errors and timeouts: %s',
	async (error) => {
		api.mockRejectedValueOnce(error);
		expect(await check()).toBe(2);
	}
);

it.each([
	['missing projects', []],
	['missing dependencies', [{}]],
	['invalid dependencies', [{ dependencies: [] }]],
	['missing version', [{ dependencies: { example: {} } }]],
	[
		'unsupported local dependency',
		[{ dependencies: { example: { version: 'link:../private' } } }],
	],
	['version range', [{ dependencies: { example: { version: '^1.0.0' } } }]],
	[
		'invalid name',
		[
			{
				dependencies: {
					example: { from: 'https://user:secret@private.invalid/', version: '1.0.0' },
				},
			},
		],
	],
])('rejects package enumeration with %s before contacting OSV', async (_name, list) => {
	expect(await check(result(cleanPnpm), result(list))).toBe(2);
	expect(api).not.toHaveBeenCalled();
});

it.each(['ENOENT', 'ETIMEDOUT', 'ENOBUFS'])('reports pnpm list %s as incomplete', async (code) => {
	expect(
		await check(result(cleanPnpm), {
			...result(packageList),
			error: Object.assign(new Error('Tool failure'), { code }),
		})
	).toBe(2);
	expect(api).not.toHaveBeenCalled();
});

it.each([
	{ status: 1, signal: null },
	{ status: 2, signal: null },
	{ status: null, signal: 'SIGTERM' as const },
])('rejects abnormal list process results: %j', async (processResult) => {
	expect(await check(result(cleanPnpm), { ...result(packageList), ...processResult })).toBe(2);
	expect(api).not.toHaveBeenCalled();
});

it('rejects truncated subprocess JSON and sanitizes stderr', async () => {
	expect(
		await check(result(cleanPnpm), {
			...result(packageList),
			stdout: '{',
			stderr: 'Failure\n\x1b[31mdetail\x1b[0m',
		})
	).toBe(2);
	expect(console.error).toHaveBeenCalledWith('Failure\\u{a}detail');
});

it('fails for low-severity pnpm counts even without advisory details', async () => {
	expect(await check(result(pnpmCounts({ ...counts, low: 1 })))).toBe(1);
});

it('fails for pnpm advisories even if metadata claims success, sanitizing output', async () => {
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
	['unsupported npm format', { metadata: { vulnerabilities: counts }, vulnerabilities: {} }],
	['negative count', pnpmCounts({ ...counts, high: -1 })],
	['fractional count', pnpmCounts({ ...counts, high: 0.5 })],
	['string count', pnpmCounts({ ...counts, high: '0' })],
	['missing severity', pnpmCounts({ low: 0 })],
	['unsafe total', pnpmCounts({ ...counts, high: Number.MAX_SAFE_INTEGER, critical: 1 })],
	['invalid advisory', { ...cleanPnpm, advisories: { '1': { module_name: 'example' } } }],
])('rejects pnpm %s rather than treating it as clean', async (_name, report) => {
	expect(await check(result(report))).toBe(2);
	expect(api).toHaveBeenCalled();
});

it('does not accept pnpm audit exit 1 without recognized findings', async () => {
	expect(await check(result(cleanPnpm, 1))).toBe(2);
});

it('still queries OSV after pnpm audit fails, giving incomplete audits precedence', async () => {
	api.mockResolvedValueOnce(Response.json({ results: [{ vulns: [{ id: 'OSV-1' }] }] }));
	expect(await check(result({}, 2))).toBe(2);
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-1');
});

it('gives incomplete OSV audits precedence over pnpm findings', async () => {
	api.mockRejectedValueOnce(new Error('Network failed'));
	expect(await check(result(pnpmCounts({ ...counts, high: 1 })))).toBe(2);
});

it('requires the pnpm entry point without downloading any tools', async () => {
	vi.stubEnv('npm_execpath', undefined);
	expect(await checkDependencies()).toBe(2);
	expect(spawn).not.toHaveBeenCalled();
	expect(api).not.toHaveBeenCalled();
});
