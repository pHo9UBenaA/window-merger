import { checkRelease, checkVersions } from '../lib/release-version.ts';

try {
	const commit = process.env.RELEASE_COMMIT ?? 'HEAD';
	if (checkRelease(process.env.RELEASE_BRANCH ?? '', commit) === null) checkVersions(commit);
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
