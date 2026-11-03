import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import {
	checkRelease,
	checkVersions,
	releaseVersion,
	validateReleaseVersion,
} from './lib/release-version.ts';

type RunGit = (args: string[]) => string;

const git = (args: string[], cwd: string, env = process.env): string =>
	execFileSync('git', args, {
		cwd,
		env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

const pnpm = (args: string[], cwd: string, env: NodeJS.ProcessEnv): string => {
	const inheritedCli = env.npm_execpath;
	const cli =
		inheritedCli && /^pnpm(?:[.-]|$)/i.test(basename(inheritedCli)) ? inheritedCli : 'pnpm';
	const useNode = /\.[cm]?js$/.test(cli);
	return execFileSync(useNode ? process.execPath : cli, useNode ? [cli, ...args] : args, {
		cwd,
		env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
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
	cwd = process.cwd(),
	remote = 'origin'
): 'created' | 'existing' | 'skipped' => {
	const version = checkRelease(ref, commit, cwd);
	if (version === null) return 'skipped';
	const base = git(['rev-parse', `${commit}^{commit}`], cwd);
	const repository = git(['rev-parse', '--show-toplevel'], cwd);
	const remoteUrl = git(['remote', 'get-url', '--push', remote], cwd);
	const destination =
		isAbsolute(remoteUrl) || remoteUrl.includes(':') ? remoteUrl : resolve(cwd, remoteUrl);
	const environment = { ...process.env };
	// Git-hook/index variables must not redirect sandbox commands to the caller.
	for (const name of git(['rev-parse', '--local-env-vars'], cwd).split('\n')) {
		delete environment[name];
	}
	const directory = mkdtempSync(join(tmpdir(), 'window-merger-release-'));
	const checkout = join(directory, 'checkout');
	const runGit: RunGit = (args) => git(args, checkout, environment);
	try {
		// Isolate pnpm's commit/tag writes from the caller's checkout and local tags.
		git(
			['clone', '--no-local', '--no-checkout', '--no-tags', '--', repository, checkout],
			cwd,
			environment
		);
		runGit(['checkout', '--detach', base]);
		runGit(['remote', 'set-url', 'origin', destination]);
		for (const field of ['user.name', 'user.email']) {
			runGit(['config', field, git(['config', field], cwd)]);
		}
		runGit(['config', 'commit.gpgSign', 'false']);
		runGit(['config', 'tag.gpgSign', 'false']);

		const configuredPrefix = pnpm(
			['config', 'get', 'tagVersionPrefix', '--json'],
			checkout,
			environment
		);
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
		pnpm(
			['version', version, '--allow-same-version', '--message', message],
			checkout,
			environment
		);
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
		rmSync(directory, { recursive: true, force: true });
	}
};

if (import.meta.main) {
	try {
		const args = process.argv.slice(2);
		if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
			throw new Error('Use --check to validate or no arguments to publish a release tag');
		}
		if (args[0] === '--check') {
			const commit = process.env.RELEASE_COMMIT ?? 'HEAD';
			checkVersions(commit);
			checkRelease(process.env.RELEASE_BRANCH ?? '', commit);
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
