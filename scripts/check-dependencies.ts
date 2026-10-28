import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

type Report = { total: number; lines: string[] };
type Package = { name: string; version: string };
type OsvQuery = {
	package: { ecosystem: 'npm'; name: string };
	version: string;
	page_token?: string;
};

const object = (value: unknown): Record<string, unknown> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		throw new Error('Expected a JSON object');
	return value as Record<string, unknown>;
};
const array = (value: unknown): unknown[] => {
	if (!Array.isArray(value)) throw new Error('Expected a JSON array');
	return value;
};
const text = (value: unknown): string => {
	if (typeof value !== 'string') throw new Error('Expected a JSON string');
	return value;
};
const safeText = (value: unknown): string =>
	stripVTControlCharacters(String(value))
		.replaceAll('::', '\\u{3a}\\u{3a}')
		.replace(
			/[\p{Cc}\p{Cf}]/gu,
			(character) => `\\u{${character.codePointAt(0)?.toString(16)}}`
		);

// pnpm 11 reports advisories, not npm's vulnerabilities[].via representation.
const parsePnpm = (value: unknown): Report => {
	const report = object(value);
	const counts = object(object(report.metadata).vulnerabilities);
	let total = 0;
	for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
		const count = counts[severity];
		if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
			throw new Error(`Invalid ${severity} vulnerability count`);
		total += count;
	}
	if (!Number.isSafeInteger(total)) throw new Error('Invalid total vulnerability count');
	const lines = Object.values(object(report.advisories)).map((value) => {
		const advisory = object(value);
		return `${text(advisory.module_name)}: ${text(advisory.title)}`;
	});
	return { total: Math.max(total, lines.length), lines };
};

const runPnpm = (pnpm: string, args: string[]): { value: unknown; status: number } => {
	// Use Node directly, avoiding shell / .cmd resolution on Windows.
	const result = spawnSync(process.execPath, [pnpm, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 60000,
		maxBuffer: 16 * 1024 * 1024,
	});
	try {
		if (result.error) throw result.error;
		if (result.signal || (result.status !== 0 && result.status !== 1))
			throw new Error(
				`Command failed (code ${result.status}, signal ${result.signal ?? 'none'})`
			);
		return { value: JSON.parse(result.stdout), status: result.status };
	} catch (error) {
		if (result.stderr?.trim()) console.error(safeText(result.stderr.trim()));
		throw error;
	}
};

const lockedPackages = (pnpm: string): Package[] => {
	// Read the lockfile, including transitive, development and other-platform optional deps.
	const { value, status } = runPnpm(pnpm, [
		'list',
		'--lockfile-only',
		'--depth',
		'Infinity',
		'--json',
	]);
	if (status !== 0) throw new Error('pnpm list failed');
	const pending = array(value).map(object);
	const packages = new Map<string, Package>();
	while (pending.length > 0) {
		const node = pending.pop();
		if (!node) break;
		for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
			if (node[group] === undefined) continue;
			for (const [alias, value] of Object.entries(object(node[group]))) {
				const entry = object(value);
				const name = entry.from === undefined ? alias : text(entry.from);
				const version = text(entry.version);
				if (
					name.length > 214 ||
					!/^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/.test(name) ||
					version.length > 256 ||
					!/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)
				)
					throw new Error('Unsupported locked package name or version');
				packages.set(`${name}@${version}`, { name, version });
				pending.push(entry);
			}
		}
	}
	if (packages.size === 0) throw new Error('No locked packages found');
	return [...packages.values()];
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
	if (
		response.status !== 200 ||
		!response.headers.get('content-type')?.includes('application/json')
	) {
		await response.body?.cancel();
		throw new Error(`Unexpected OSV response (HTTP ${response.status})`);
	}
	if (!response.body) throw new Error('Empty OSV response');
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.byteLength;
		if (size > 4 * 1024 * 1024) throw new Error('OSV response exceeds 4 MiB');
		chunks.push(chunk);
	}
	const report = object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
	if ('error' in report) throw new Error('OSV returned an error');
	const results = array(report.results);
	if (results.length !== queries.length)
		throw new Error('OSV result count does not match queries');
	return results;
};

const checkOsv = async (pnpm: string): Promise<Report> => {
	const packages = lockedPackages(pnpm);
	const signal = AbortSignal.timeout(60000);
	const lines = new Set<string>();
	const seenTokens = new Set<string>();
	// Small sequential batches bound response size and avoid flooding the service.
	for (let start = 0; start < packages.length; start += 100) {
		let queries: OsvQuery[] = packages.slice(start, start + 100).map(({ name, version }) => ({
			package: { ecosystem: 'npm', name },
			version,
		}));
		for (let page = 0; queries.length > 0; page++) {
			if (page >= 100) throw new Error('Too many OSV pages');
			const results = await queryOsv(queries, signal);
			const next: OsvQuery[] = [];
			for (const [index, value] of results.entries()) {
				const result = object(value);
				if (Object.keys(result).some((key) => key !== 'vulns' && key !== 'next_page_token'))
					throw new Error('Unexpected OSV query result');
				const query = queries[index];
				const pkg = `${query.package.name}@${query.version}`;
				for (const value of array(result.vulns === undefined ? [] : result.vulns)) {
					const id = text(object(value).id);
					if (!id.trim()) throw new Error('Missing OSV vulnerability ID');
					lines.add(`${pkg}: ${id}`);
				}
				const token =
					result.next_page_token === undefined ? '' : text(result.next_page_token);
				if (token) {
					const key = `${pkg}:${token}`;
					if (token.length > 4096 || seenTokens.has(key))
						throw new Error('Invalid OSV pagination');
					seenTokens.add(key);
					next.push({ ...query, page_token: token });
				}
			}
			queries = next;
		}
	}
	return { total: lines.size, lines: [...lines] };
};

const audit = async (label: string, check: () => Report | Promise<Report>): Promise<number> => {
	console.log(`## ${label}`);
	try {
		const report = await check();
		if (report.total > 0) {
			console.log(`Found ${report.total} vulnerability entries.`);
			for (const line of report.lines) console.log(`  - ${safeText(line)}`);
			return 1;
		}
		console.log(`No vulnerabilities found by ${label}.`);
		return 0;
	} catch (error) {
		console.error(
			`${label}: audit incomplete: ${safeText(error instanceof Error ? error.message : error)}`
		);
		return 2;
	}
};

// 0: both completed cleanly; 1: findings; 2: incomplete or invalid audit.
export const checkDependencies = async (): Promise<number> => {
	const pnpm = process.env.npm_execpath;
	if (!pnpm) {
		console.error('Run this check via pnpm check:dependencies');
		return 2;
	}
	const pnpmStatus = await audit('pnpm audit', () => {
		const { value, status } = runPnpm(pnpm, ['audit', '--json']);
		const report = parsePnpm(value);
		if (status !== 0 && report.total === 0)
			throw new Error('Command exited 1 without recognized findings');
		return report;
	});
	const osvStatus = await audit('OSV API', () => checkOsv(pnpm));
	return Math.max(pnpmStatus, osvStatus);
};

if (import.meta.main) process.exitCode = await checkDependencies();
