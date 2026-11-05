import { stripVTControlCharacters } from 'node:util';
import { object as requireObject } from '../lib/input.ts';
import { readJsonInput } from '../lib/json-cli.ts';

type ProcessReport = {
	readonly stdout: string;
	readonly stderr: string;
	readonly status: number | null;
	readonly signal: string | null;
	readonly error?: string;
};
export type DependencyReports = { readonly audit: ProcessReport; readonly list: ProcessReport };

type AuditReport = { findingCount: number; lines: string[] };
type LockedPackage = { name: string; version: string };
type OsvQuery = {
	package: { ecosystem: 'npm'; name: string };
	version: string;
	page_token?: string;
};
type OsvResult = { vulnerabilityIds: string[]; nextPageToken: string };

const AUDIT_TIMEOUT_MS = 60_000;
const MAX_OSV_RESPONSE_BYTES = 4 * 1024 * 1024;
const OSV_BATCH_SIZE = 100;
const MAX_OSV_PAGES = 100;
const MAX_OSV_PAGE_TOKEN_CHARS = 4096;

const requireArray = (value: unknown): unknown[] => {
	if (!Array.isArray(value)) throw new Error('Expected a JSON array');
	return value;
};
const requireString = (value: unknown): string => {
	if (typeof value !== 'string') throw new Error('Expected a JSON string');
	return value;
};
const escapeLogText = (value: unknown): string =>
	stripVTControlCharacters(String(value))
		.replaceAll('::', '\\u{3a}\\u{3a}')
		.replace(
			/[\p{Cc}\p{Cf}]/gu,
			(character) => `\\u{${character.codePointAt(0)?.toString(16)}}`
		);

// pnpm 11 reports advisories, not npm's vulnerabilities[].via representation.
const parsePnpmReport = (value: unknown): AuditReport => {
	const report = requireObject(value);
	const metadata = requireObject(report.metadata);
	const severityCounts = requireObject(metadata.vulnerabilities);
	let findingCount = 0;
	for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
		const count = severityCounts[severity];
		if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
			throw new Error(`Invalid ${severity} vulnerability count`);
		findingCount += count;
	}
	if (!Number.isSafeInteger(findingCount)) throw new Error('Invalid total vulnerability count');

	const lines = Object.values(requireObject(report.advisories)).map((value) => {
		const advisory = requireObject(value);
		return `${requireString(advisory.module_name)}: ${requireString(advisory.title)}`;
	});
	return { findingCount: Math.max(findingCount, lines.length), lines };
};

const parseProcessReport = (result: ProcessReport): { data: unknown; exitCode: number } => {
	try {
		if (result.error) throw result.error;
		const exitCode = result.status;
		const hasAuditExitCode = exitCode === 0 || exitCode === 1;
		if (result.signal || !hasAuditExitCode)
			throw new Error(
				`Command failed (code ${result.status}, signal ${result.signal ?? 'none'})`
			);
		return { data: JSON.parse(result.stdout), exitCode };
	} catch (error) {
		if (result.stderr?.trim()) console.error(escapeLogText(result.stderr.trim()));
		throw error;
	}
};

const parseLockedPackage = (alias: string, entry: Record<string, unknown>): LockedPackage => {
	const name = entry.from === undefined ? alias : requireString(entry.from);
	const version = requireString(entry.version);
	const hasValidName = name.length <= 214 && /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/.test(name);
	const hasValidVersion =
		version.length <= 256 && /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version);
	if (!hasValidName || !hasValidVersion)
		throw new Error('Unsupported locked package name or version');
	return { name, version };
};

const readLockedPackages = (result: ProcessReport): LockedPackage[] => {
	const { data, exitCode } = parseProcessReport(result);
	if (exitCode !== 0) throw new Error('pnpm list failed');

	const pendingNodes = requireArray(data).map(requireObject);
	const packagesByIdentity = new Map<string, LockedPackage>();
	while (pendingNodes.length > 0) {
		const node = pendingNodes.pop();
		if (!node) break;
		for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
			if (node[group] === undefined) continue;
			for (const [alias, value] of Object.entries(requireObject(node[group]))) {
				const entry = requireObject(value);
				const pkg = parseLockedPackage(alias, entry);
				packagesByIdentity.set(`${pkg.name}@${pkg.version}`, pkg);
				pendingNodes.push(entry);
			}
		}
	}
	if (packagesByIdentity.size === 0) throw new Error('No locked packages found');
	return [...packagesByIdentity.values()];
};

const queryOsv = async (queries: OsvQuery[], signal: AbortSignal): Promise<unknown[]> => {
	// Only names/versions (and opaque pagination tokens) leave the machine, never paths or lockfiles.
	const response = await fetch('https://api.osv.dev/v1/querybatch', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ queries }),
		redirect: 'error',
		credentials: 'omit',
		signal,
	});
	const isJsonResponse = response.headers.get('content-type')?.includes('application/json');
	if (response.status !== 200 || !isJsonResponse) {
		await response.body?.cancel();
		throw new Error(`Unexpected OSV response (HTTP ${response.status})`);
	}
	if (!response.body) throw new Error('Empty OSV response');

	const bodyChunks: Uint8Array[] = [];
	let responseBytes = 0;
	for await (const chunk of response.body) {
		responseBytes += chunk.byteLength;
		if (responseBytes > MAX_OSV_RESPONSE_BYTES) throw new Error('OSV response exceeds 4 MiB');
		bodyChunks.push(chunk);
	}
	const report = requireObject(JSON.parse(Buffer.concat(bodyChunks).toString('utf8')));
	if ('error' in report) throw new Error('OSV returned an error');
	const results = requireArray(report.results);
	if (results.length !== queries.length)
		throw new Error('OSV result count does not match queries');
	return results;
};

const parseOsvResult = (value: unknown): OsvResult => {
	const result = requireObject(value);
	const hasUnknownFields = Object.keys(result).some(
		(key) => key !== 'vulns' && key !== 'next_page_token'
	);
	if (hasUnknownFields) throw new Error('Unexpected OSV query result');

	const vulnerabilities = requireArray(result.vulns === undefined ? [] : result.vulns);
	const vulnerabilityIds = vulnerabilities.map((value) => {
		const vulnerability = requireObject(value);
		const id = requireString(vulnerability.id);
		if (!id.trim()) throw new Error('Missing OSV vulnerability ID');
		return id;
	});
	const nextPageToken =
		result.next_page_token === undefined ? '' : requireString(result.next_page_token);
	return { vulnerabilityIds, nextPageToken };
};

const scanOsvBatch = async (
	initialQueries: OsvQuery[],
	signal: AbortSignal
): Promise<Set<string>> => {
	const findings = new Set<string>();
	const seenPageTokens = new Set<string>();
	let pendingQueries = initialQueries;
	for (let page = 0; pendingQueries.length > 0; page++) {
		if (page >= MAX_OSV_PAGES) throw new Error('Too many OSV pages');
		const results = await queryOsv(pendingQueries, signal);
		const nextPageQueries: OsvQuery[] = [];
		for (const [index, value] of results.entries()) {
			const query = pendingQueries[index];
			const packageIdentity = `${query.package.name}@${query.version}`;
			const { vulnerabilityIds, nextPageToken } = parseOsvResult(value);
			for (const id of vulnerabilityIds) findings.add(`${packageIdentity}: ${id}`);

			if (!nextPageToken) continue;
			const tokenKey = `${packageIdentity}:${nextPageToken}`;
			if (nextPageToken.length > MAX_OSV_PAGE_TOKEN_CHARS || seenPageTokens.has(tokenKey))
				throw new Error('Invalid OSV pagination');
			seenPageTokens.add(tokenKey);
			nextPageQueries.push({ ...query, page_token: nextPageToken });
		}
		pendingQueries = nextPageQueries;
	}
	return findings;
};

const checkOsv = async (list: ProcessReport): Promise<AuditReport> => {
	const packages = readLockedPackages(list);
	const signal = AbortSignal.timeout(AUDIT_TIMEOUT_MS);
	const findings = new Set<string>();
	// Small sequential batches bound response size and avoid flooding the service.
	for (let start = 0; start < packages.length; start += OSV_BATCH_SIZE) {
		const queries: OsvQuery[] = packages
			.slice(start, start + OSV_BATCH_SIZE)
			.map(({ name, version }) => ({
				package: { ecosystem: 'npm', name },
				version,
			}));
		const batchFindings = await scanOsvBatch(queries, signal);
		for (const finding of batchFindings) findings.add(finding);
	}
	return { findingCount: findings.size, lines: [...findings] };
};

const runAudit = async (
	label: string,
	check: () => AuditReport | Promise<AuditReport>
): Promise<number> => {
	console.log(`## ${label}`);
	try {
		const report = await check();
		if (report.findingCount > 0) {
			console.log(`Found ${report.findingCount} vulnerability entries.`);
			for (const line of report.lines) console.log(`  - ${escapeLogText(line)}`);
			return 1;
		}
		console.log(`No vulnerabilities found by ${label}.`);
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : error;
		console.error(`${label}: audit incomplete: ${escapeLogText(message)}`);
		return 2;
	}
};

// 0: both completed cleanly; 1: findings; 2: incomplete or invalid audit.
export const checkDependencies = async (reports: DependencyReports): Promise<number> => {
	const pnpmStatus = await runAudit('pnpm audit', () => {
		const { data, exitCode } = parseProcessReport(reports.audit);
		const report = parsePnpmReport(data);
		if (exitCode !== 0 && report.findingCount === 0)
			throw new Error('Command exited 1 without recognized findings');
		return report;
	});
	const osvStatus = await runAudit('OSV API', () => checkOsv(reports.list));
	return Math.max(pnpmStatus, osvStatus);
};

if (import.meta.main) {
	try {
		const input = requireObject(readJsonInput());
		const parse = (value: unknown): ProcessReport => {
			const report = requireObject(value);
			if (report.status !== null && typeof report.status !== 'number')
				throw new Error('Invalid process status');
			if (report.signal !== null && typeof report.signal !== 'string')
				throw new Error('Invalid process signal');
			return {
				stdout: requireString(report.stdout),
				stderr: requireString(report.stderr),
				status: report.status,
				signal: report.signal,
				error: report.error === undefined ? undefined : requireString(report.error),
			};
		};
		process.exitCode = await checkDependencies({
			audit: parse(input.audit),
			list: parse(input.list),
		});
	} catch (error) {
		console.error(error);
		process.exitCode = 2;
	}
}
