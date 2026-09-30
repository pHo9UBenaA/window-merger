import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkDependencies } from '../../scripts/check-dependencies';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
const spawn = vi.mocked(spawnSync);
const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const pnpmCounts = (vulnerabilities: unknown) => ({
	metadata: { vulnerabilities },
	advisories: {},
});
const cleanPnpm = pnpmCounts(counts);
const packageEntry = { package: { name: 'example', version: '1.0.0' } };
const osvPackage = (entry: unknown) => ({ results: [{ packages: [entry] }] });
const cleanOsv = osvPackage(packageEntry);
const result = (report: unknown, status = 0): SpawnSyncReturns<string> => ({
	status,
	signal: null,
	error: undefined,
	stdout: JSON.stringify(report),
	stderr: '',
	pid: 1,
	output: [null, JSON.stringify(report), ''],
});
const check = (pnpm: SpawnSyncReturns<string>, osv = result(cleanOsv)) => {
	spawn.mockReturnValueOnce(pnpm).mockReturnValueOnce(osv);
	return checkDependencies();
};

beforeEach(() => {
	vi.stubEnv('npm_execpath', '/tools/pnpm.cjs');
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

it('runs pnpm and recursive OSV scans and reports a completed clean audit', () => {
	expect(check(result(cleanPnpm))).toBe(0);
	expect(spawn).toHaveBeenCalledWith(
		process.execPath,
		['/tools/pnpm.cjs', 'audit', '--json'],
		expect.objectContaining({ timeout: 60000, encoding: 'utf8' })
	);
	expect(spawn).toHaveBeenCalledWith(
		'osv-scanner',
		['scan', 'source', '--format', 'json', '--recursive', '.', '--all-packages', '--all-vulns'],
		expect.any(Object)
	);
});

it('fails for low-severity counts even without advisory details', () => {
	expect(check(result(pnpmCounts({ ...counts, low: 1 })))).toBe(1);
});

it('fails for advisories even if metadata and the command claim success, sanitizing output', () => {
	expect(
		check(
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

it('reports OSV package versions and vulnerability IDs with optional summaries', () => {
	expect(
		check(
			result(cleanPnpm),
			result(
				osvPackage({
					...packageEntry,
					vulnerabilities: [{ id: 'OSV-1', summary: 'Unsafe code' }, { id: 'OSV-2' }],
				}),
				1
			)
		)
	).toBe(1);
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-1 (Unsafe code)');
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-2');
});

it.each([
	{ results: null },
	{ results: [{ packages: null }] },
])('accepts documented null Go slices: %j', (report) => {
	expect(check(result(cleanPnpm), result(report))).toBe(0);
});

it.each([
	['unsupported npm format', { metadata: { vulnerabilities: counts }, vulnerabilities: {} }],
	['negative count', pnpmCounts({ ...counts, high: -1 })],
	['fractional count', pnpmCounts({ ...counts, high: 0.5 })],
	['string count', pnpmCounts({ ...counts, high: '0' })],
	['missing severity', pnpmCounts({ low: 0 })],
	['unsafe total', pnpmCounts({ ...counts, high: Number.MAX_SAFE_INTEGER, critical: 1 })],
	['invalid advisory', { ...cleanPnpm, advisories: { '1': { module_name: 'example' } } }],
])('rejects pnpm %s rather than treating it as clean', (_name, report) => {
	expect(check(result(report))).toBe(2);
});

it.each([
	['missing results', {}],
	['wrong results type', { results: {} }],
	['missing packages', { results: [{}] }],
	['invalid package', osvPackage({ package: { name: 'example' } })],
	['null vulnerabilities', osvPackage({ ...packageEntry, vulnerabilities: null })],
	[
		'missing vulnerability ID',
		osvPackage({ ...packageEntry, vulnerabilities: [{ summary: 'Unsafe' }] }),
	],
])('rejects OSV %s rather than treating it as clean', (_name, report) => {
	expect(check(result(cleanPnpm), result(report))).toBe(2);
});

it.each(['ENOENT', 'ETIMEDOUT', 'ENOBUFS'])('reports OSV %s as incomplete, not a skip', (code) => {
	expect(
		check(result(cleanPnpm), {
			...result(cleanOsv),
			error: Object.assign(new Error('Tool failure'), { code }),
		})
	).toBe(2);
});

it.each([
	{ status: 2, signal: null },
	{ status: null, signal: 'SIGTERM' as const },
])('reports an abnormal process result as incomplete: %j', (processResult) => {
	expect(check(result(cleanPnpm), { ...result(cleanOsv), ...processResult })).toBe(2);
});

it('rejects truncated JSON and sanitizes command stderr', () => {
	expect(
		check(result(cleanPnpm), {
			...result(cleanOsv),
			stdout: '{',
			stderr: 'Failure\n\x1b[31mdetail\x1b[0m',
		})
	).toBe(2);
	expect(console.error).toHaveBeenCalledWith('Failure\\u{a}detail');
});

it('does not accept exit 1 without recognized findings', () => {
	expect(check(result(cleanPnpm, 1))).toBe(2);
});

it('still runs OSV after pnpm fails and gives incomplete audits precedence over findings', () => {
	expect(
		check(
			result({}, 2),
			result(
				osvPackage({
					...packageEntry,
					vulnerabilities: [{ id: 'OSV-1' }],
				}),
				1
			)
		)
	).toBe(2);
	expect(console.log).toHaveBeenCalledWith('  - example@1.0.0: OSV-1');
});

it('requires the pnpm entry point but still runs OSV when it is absent', () => {
	vi.stubEnv('npm_execpath', undefined);
	spawn.mockReturnValueOnce(result(cleanOsv));
	expect(checkDependencies()).toBe(2);
	expect(spawn).toHaveBeenCalledExactlyOnceWith(
		'osv-scanner',
		expect.any(Array),
		expect.any(Object)
	);
});
