import { join } from 'node:path';
import { checkRelease, releaseVersion, validateReleaseVersion } from '../lib/release-version.ts';
import { callOperation } from '../runtime/client.ts';

type RunGit = (args: readonly string[]) => string;

const git = (args: readonly string[], cwd: string): string =>
	callOperation<string>('git-read', { args, cwd }).trim();

const compareVersions = (leftVersion: string, rightVersion: string): number => {
	const leftParts = leftVersion.split('.').map(Number);
	const rightParts = rightVersion.split('.').map(Number);
	for (let index = 0; index < 3; index++) {
		const difference = leftParts[index] - rightParts[index];
		if (difference !== 0) return difference;
	}
	return 0;
};

const readRemoteTags = (runGit: RunGit): Map<string, string> => {
	const tags = new Map<string, string>();
	for (const line of runGit(['ls-remote', '--tags', 'origin']).split('\n')) {
		const [objectSha, tagRef] = line.split(/\s+/);
		if (tagRef) tags.set(tagRef, objectSha);
	}
	return tags;
};

// Annotated tags need the peeled commit (^{}) rather than the tag object's SHA.
const findTagCommit = (tags: ReadonlyMap<string, string>, tagName: string): string | undefined =>
	tags.get(`refs/tags/${tagName}^{}`) ?? tags.get(`refs/tags/${tagName}`);

const publishedVersion = (tagRef: string, prefix: string): string | null => {
	const name = tagRef.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '');
	const version = name.startsWith(prefix) ? name.slice(prefix.length) : '';
	return /^\d+\.\d+\.\d+$/.test(version)
		? validateReleaseVersion(version)
		: releaseVersion(tagRef);
};

const isReleaseCommit = (
	candidate: string,
	base: string,
	message: string,
	runGit: RunGit
): boolean => {
	// Accept tags created by the previous workflow, which tagged the merge itself.
	if (candidate === base) return true;
	const parents = runGit(['rev-list', '--parents', '-n', '1', candidate]).split(' ');
	return (
		parents.length === 2 &&
		parents[1] === base &&
		runGit(['rev-parse', `${candidate}^{tree}`]) === runGit(['rev-parse', `${base}^{tree}`]) &&
		runGit(['log', '-1', '--format=%s', candidate]) === message
	);
};

export const createReleaseTag = (
	ref: string,
	commit: string,
	cwd = process.cwd()
): 'created' | 'existing' | 'skipped' => {
	const version = checkRelease(ref, commit, cwd);
	if (version === null) return 'skipped';
	const base = git(['rev-parse', `${commit}^{commit}`], cwd);
	const directory = callOperation<string>('release-directory', { action: 'create' });
	const checkout = join(directory, 'checkout');
	const runGit: RunGit = (args) => {
		const operation = [
			'checkout',
			'remote',
			'config',
			'check-ref-format',
			'fetch',
			'push',
		].includes(args[0])
			? 'release-git'
			: 'git-read';
		return callOperation<string>(operation, { args, cwd: checkout, isolated: true }).trim();
	};
	try {
		callOperation('release-git', { args: ['clone'], cwd: checkout });
		runGit(['checkout', '--detach', base]);
		runGit(['remote', 'set-url', 'origin']);
		for (const field of ['user.name', 'user.email']) {
			runGit(['config', field]);
		}
		runGit(['config', 'commit.gpgSign', 'false']);
		runGit(['config', 'tag.gpgSign', 'false']);

		const configuredPrefix = callOperation<string>('release-pnpm', {
			action: 'prefix',
			cwd: checkout,
		});
		const prefix: unknown = configuredPrefix ? JSON.parse(configuredPrefix) : 'v';
		if (typeof prefix !== 'string') throw new Error('tagVersionPrefix must be a string');
		const tagName = `${prefix}${version}`;
		runGit(['check-ref-format', `refs/tags/${tagName}`]);
		const message = `chore: release ${version}`;
		const existingRelease = (tags: ReadonlyMap<string, string>): boolean => {
			const candidate = findTagCommit(tags, tagName);
			if (!candidate) return false;
			runGit(['fetch', '--no-tags', 'origin', `refs/tags/${tagName}`]);
			if (!isReleaseCommit(candidate, base, message, runGit)) {
				throw new Error(`Tag ${tagName} already points to a different commit`);
			}
			return true;
		};
		const tags = readRemoteTags(runGit);
		if (existingRelease(tags)) return 'existing';
		for (const tagRef of tags.keys()) {
			const previous = publishedVersion(tagRef, prefix);
			if (previous !== null && compareVersions(previous, version) >= 0) {
				throw new Error(
					`Release ${version} is not newer than published version ${previous}`
				);
			}
		}

		// The PR already bumped both manifests. pnpm creates an empty release marker
		// commit and an annotated tag, honoring tagVersionPrefix and the version hook.
		callOperation('release-pnpm', { action: 'version', version, cwd: checkout });
		const releaseCommit = runGit(['rev-parse', 'HEAD']);
		if (
			releaseCommit === base ||
			!isReleaseCommit(releaseCommit, base, message, runGit) ||
			runGit(['rev-parse', `refs/tags/${tagName}^{commit}`]) !== releaseCommit
		) {
			throw new Error('pnpm version must create a release commit/tag without changing files');
		}
		if (runGit(['status', '--porcelain'])) {
			throw new Error('pnpm version left uncommitted release changes');
		}
		try {
			// Publish only pnpm's tag; main remains at the approved merge commit.
			runGit(['push', 'origin', `refs/tags/${tagName}`]);
		} catch (error) {
			// Another run may have published its equivalent marker in the meantime.
			if (!existingRelease(readRemoteTags(runGit))) throw error;
			return 'existing';
		}
		return 'created';
	} finally {
		callOperation('release-directory', { action: 'remove', directory });
	}
};

const runCli = (): void => {
	const args = process.argv.slice(2);
	if (args.length > 0)
		throw new Error('Use release-check to validate or release with no arguments to publish');
	const branch = process.env.RELEASE_BRANCH;
	const commit = process.env.RELEASE_COMMIT;
	if (!branch || !commit) throw new Error('RELEASE_BRANCH and RELEASE_COMMIT are required');
	console.log(createReleaseTag(branch, commit));
};

if (import.meta.main) {
	try {
		runCli();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
