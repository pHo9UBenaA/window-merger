import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

type Report = { total: number; lines: string[] };

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const object = (value: unknown): Record<string, unknown> => {
	if (!isJsonObject(value)) throw new Error('Expected a JSON object');
	return value;
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

const parseOsv = (value: unknown): Report => {
	const report = object(value);
	const lines: string[] = [];
	// Go slices may be null; clean packages omit vulnerabilities.
	for (const source of array(report.results === null ? [] : report.results)) {
		const packages = object(source).packages;
		for (const value of array(packages === null ? [] : packages)) {
			const entry = object(value);
			const pkg = object(entry.package);
			const name = text(pkg.name);
			const version = text(pkg.version);
			for (const value of array(
				entry.vulnerabilities === undefined ? [] : entry.vulnerabilities
			)) {
				const vulnerability = object(value);
				const summary =
					vulnerability.summary === undefined ? '' : text(vulnerability.summary);
				lines.push(
					`${name}@${version}: ${text(vulnerability.id)}${summary ? ` (${summary})` : ''}`
				);
			}
		}
	}
	return { total: lines.length, lines };
};

const audit = (
	label: string,
	command: string,
	args: string[],
	parse: (value: unknown) => Report
): number => {
	console.log(`## ${label}`);
	let result: SpawnSyncReturns<string> | undefined;
	try {
		result = spawnSync(command, args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 60000,
			maxBuffer: 16 * 1024 * 1024,
		});
		if (result.error) throw result.error;
		if (result.signal || (result.status !== 0 && result.status !== 1))
			throw new Error(
				`Command failed (code ${result.status}, signal ${result.signal ?? 'none'})`
			);
		const report = parse(JSON.parse(result.stdout));
		if (report.total > 0) {
			console.log(`Found ${report.total} vulnerability entries.`);
			for (const line of report.lines) console.log(`  - ${safeText(line)}`);
			return 1;
		}
		if (result.status !== 0) throw new Error('Command exited 1 without recognized findings');
		console.log(`No vulnerabilities found by ${label}.`);
		return 0;
	} catch (error) {
		console.error(
			`${label}: audit incomplete: ${safeText(error instanceof Error ? error.message : error)}`
		);
		if (result?.stderr?.trim()) console.error(safeText(result.stderr.trim()));
		return 2;
	}
};

// 0: both completed cleanly; 1: findings; 2: incomplete or invalid audit.
export const checkDependencies = (): number => {
	// Run pnpm's JS entry through Node, avoiding shell / .cmd resolution on Windows.
	const pnpm = process.env.npm_execpath;
	let pnpmStatus = 2;
	if (pnpm)
		pnpmStatus = audit('pnpm audit', process.execPath, [pnpm, 'audit', '--json'], parsePnpm);
	else console.error('pnpm audit: run this check via pnpm check:dependencies');
	const osvStatus = audit(
		'OSV Scanner',
		'osv-scanner',
		['scan', 'source', '--format', 'json', '--recursive', '.', '--all-packages', '--all-vulns'],
		parseOsv
	);
	return Math.max(pnpmStatus, osvStatus);
};

if (import.meta.main) process.exitCode = checkDependencies();
