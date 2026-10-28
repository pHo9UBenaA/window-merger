import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateVersion } from './validate-extension.ts';

export const releaseVersion = (ref: string): string | null => {
	const refName = ref.replace(/^refs\/(heads|tags)\//, '');
	const match = /^(?:release\/)?v(\d+\.\d+\.\d+)$/.exec(refName);
	return match ? validateVersion(match[1]) : null;
};

const git = (args: string[], cwd: string): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

export const checkRelease = (ref: string, commit: string, cwd = process.cwd()): string | null => {
	const version = releaseVersion(ref);
	if (version === null) return null;
	const manifest = JSON.parse(git(['show', `${commit}:src/assets/manifest.json`], cwd));
	if (validateVersion(manifest.version) !== version) {
		throw new Error(`Release ${ref} does not match manifest version ${manifest.version}`);
	}
	return version;
};

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

const compareVersions = (leftVersion: string, rightVersion: string): number => {
	const leftParts = leftVersion.split('.').map(Number);
	const rightParts = rightVersion.split('.').map(Number);
	for (let index = 0; index < 3; index++) {
		const difference = leftParts[index] - rightParts[index];
		if (difference !== 0) return difference;
	}
	return 0;
};

const readRemoteTags = (remote: string, cwd: string): Map<string, string> => {
	const tags = new Map<string, string>();
	for (const line of git(['ls-remote', '--tags', remote], cwd).split('\n')) {
		const [objectSha, tagRef] = line.split(/\s+/);
		if (tagRef) tags.set(tagRef, objectSha);
	}
	return tags;
};

// Annotated tags need the peeled commit (^{}) rather than the tag object's SHA.
const findTagCommit = (tags: ReadonlyMap<string, string>, tagName: string): string | undefined =>
	tags.get(`refs/tags/${tagName}^{}`) ?? tags.get(`refs/tags/${tagName}`);

export const createReleaseTag = (
	ref: string,
	commit: string,
	cwd = process.cwd(),
	remote = 'origin'
): 'created' | 'existing' | 'skipped' => {
	const version = checkRelease(ref, commit, cwd);
	if (version === null) return 'skipped';
	const commitSha = git(['rev-parse', `${commit}^{commit}`], cwd);
	const tagName = `v${version}`;
	const publishedTags = readRemoteTags(remote, cwd);
	const existingCommit = findTagCommit(publishedTags, tagName);
	if (existingCommit) {
		if (existingCommit !== commitSha)
			throw new Error(`Tag ${tagName} already points to a different commit`);
		return 'existing';
	}
	for (const tagRef of publishedTags.keys()) {
		const publishedVersion = releaseVersion(tagRef);
		if (publishedVersion !== null && compareVersions(publishedVersion, version) >= 0) {
			throw new Error(
				`Release ${version} is not newer than published version ${publishedVersion}`
			);
		}
	}
	try {
		// Publish the verified commit directly; local tags are neither created nor consulted.
		git(['push', remote, `${commitSha}:refs/tags/${tagName}`], cwd);
	} catch (error) {
		// A concurrent run or a lost response may have published this exact tag already.
		const latestTags = readRemoteTags(remote, cwd);
		if (findTagCommit(latestTags, tagName) !== commitSha) throw error;
		return 'existing';
	}
	return 'created';
};

if (import.meta.main) {
	try {
		if (process.argv.includes('--check-push')) {
			checkPush(readFileSync(0, 'utf8'));
		} else if (process.argv.includes('--check')) {
			checkRelease(process.env.RELEASE_BRANCH ?? '', process.env.RELEASE_COMMIT ?? 'HEAD');
		} else {
			const branch = process.env.RELEASE_BRANCH;
			const commit = process.env.RELEASE_COMMIT;
			if (!branch || !commit)
				throw new Error('RELEASE_BRANCH and RELEASE_COMMIT are required');
			console.log(createReleaseTag(branch, commit));
		}
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
