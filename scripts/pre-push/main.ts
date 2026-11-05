import { readFileSync } from 'node:fs';
import { text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { releaseVersion, type VersionCheckRequest } from '../lib/version.ts';

export const planPushChecks = (input: string): VersionCheckRequest[] => {
	const refsByCommit = new Map<string, Set<string>>();
	for (const line of input.trim().split('\n')) {
		if (!line) continue;
		// Unicode spaces can belong to a Git ref; only ASCII separators divide fields.
		const fields = line.trim().split(/[ \t]+/);
		if (fields.length !== 4) throw new Error('Invalid pre-push record');
		const [localRef, commit, remoteRef] = fields;
		// A deletion has no local commit to validate.
		if (/^0+$/.test(commit)) continue;
		const refs = [localRef, remoteRef].filter((ref) => releaseVersion(ref) !== null);
		if (refs.length === 0) continue;
		const collected = refsByCommit.get(commit) ?? new Set<string>();
		for (const ref of refs) collected.add(ref);
		refsByCommit.set(commit, collected);
	}
	return [...refsByCommit].map(([commit, refs]) => ({ commit, refs: [...refs] }));
};

if (import.meta.main)
	await runJsonCli(
		(input) => planPushChecks(text(input)),
		() => readFileSync(0, 'utf8')
	);
