import { object, strings } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { checkedRef } from '../lib/script-paths.ts';
import { releaseVersion } from '../lib/version.ts';
import { validateVersions } from './validate-versions.ts';

export const validateReleaseChecks = (input: unknown, allowEmpty = false): void => {
	if (!Array.isArray(input)) throw new Error('Expected committed version checks');
	if (input.length === 0 && !allowEmpty)
		throw new Error('Expected at least one committed version check');
	for (const value of input) {
		const check = object(value);
		checkedRef(check.commit);
		const version = validateVersions(check);
		for (const ref of strings(check.refs)) {
			const expected = releaseVersion(ref);
			if (expected !== null && expected !== version)
				throw new Error(`Release ${ref} does not match package version ${version}`);
		}
	}
};

if (import.meta.main)
	await runJsonCli((input) =>
		validateReleaseChecks(input, process.argv.includes('--allow-empty'))
	);
