import { runJsonCli } from '../lib/json-cli.ts';
import { releaseVersion, type VersionCheckRequest } from '../lib/version.ts';

export const planReleaseCheck = (ref: string, commit: string): VersionCheckRequest[] => [
	{ commit, refs: releaseVersion(ref) === null ? [] : [ref] },
];

if (import.meta.main)
	await runJsonCli(
		() =>
			planReleaseCheck(
				process.env.RELEASE_BRANCH ?? '',
				process.env.RELEASE_COMMIT ?? 'HEAD'
			),
		() => undefined
	);
