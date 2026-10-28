import { readFileSync } from 'node:fs';
import { checkRelease } from './lib/release-version.ts';

export const checkPush = (input: string, cwd = process.cwd()): void => {
	for (const line of input.trim().split('\n')) {
		if (!line) continue;
		const [localRef, commit, remoteRef] = line.split(/\s+/);
		// A zero local commit denotes a deletion, not a release to validate.
		if (/^0+$/.test(commit)) continue;
		checkRelease(localRef, commit, cwd);
		checkRelease(remoteRef, commit, cwd);
	}
};

if (import.meta.main) {
	try {
		checkPush(readFileSync(0, 'utf8'));
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
