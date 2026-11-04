import { join, resolve } from 'node:path';
import { gitReadCommand } from '../lib/commands.generated.ts';
import { checkRelease } from '../lib/release-version.ts';
import { runNode } from '../lib/run-node.ts';
import {
	inspectReleaseCommand,
	releaseDirectoryCommand,
	releaseGitCommand,
	releasePnpmCommand,
} from './commands.generated.ts';

type RunGit = (args: readonly string[]) => string;

const git = (args: readonly string[], cwd: string): string =>
	runNode<string>(gitReadCommand(cwd), { args, cwd }, cwd).trim();

const readRemoteTags = (runGit: RunGit): Map<string, string> => {
	const entries = runNode<[string, string][]>(inspectReleaseCommand(), {
		action: 'tags',
		output: runGit(['ls-remote', '--tags', 'origin']),
	});
	return new Map(entries.map(([sha, ref]) => [ref, sha]));
};

// Annotated tags need the peeled commit (^{}) rather than the tag object's SHA.
const findTagCommit = (tags: ReadonlyMap<string, string>, tagName: string): string | undefined =>
	tags.get(`refs/tags/${tagName}^{}`) ?? tags.get(`refs/tags/${tagName}`);

const isReleaseCommit = (
	candidate: string,
	base: string,
	message: string,
	runGit: RunGit
): boolean => {
	// Accept tags created by the previous workflow, which tagged the merge itself.
	if (candidate === base) return true;
	return runNode<boolean>(inspectReleaseCommand(), {
		action: 'marker',
		base,
		message,
		parents: runGit(['rev-list', '--parents', '-n', '1', candidate]),
		candidateTree: runGit(['rev-parse', `${candidate}^{tree}`]),
		baseTree: runGit(['rev-parse', `${base}^{tree}`]),
		subject: runGit(['log', '-1', '--format=%s', candidate]),
	});
};

export const createReleaseTag = (
	ref: string,
	commit: string,
	root = process.cwd()
): 'created' | 'existing' | 'skipped' => {
	const cwd = resolve(root);
	const version = checkRelease(ref, commit, cwd);
	if (version === null) return 'skipped';
	const base = git(['rev-parse', `${commit}^{commit}`], cwd);
	const directory = runNode<string>(releaseDirectoryCommand(cwd), { action: 'create' }, cwd);
	const checkout = join(directory, 'checkout');
	const runGit: RunGit = (args) => {
		const mutating = [
			'checkout',
			'remote',
			'config',
			'check-ref-format',
			'fetch',
			'push',
		].includes(args[0]);
		return runNode<string>(
			mutating ? releaseGitCommand(cwd) : gitReadCommand(cwd),
			{
				args,
				cwd: checkout,
				isolated: true,
			},
			cwd
		).trim();
	};
	try {
		runNode(releaseGitCommand(cwd), { args: ['clone'], cwd: checkout }, cwd);
		runGit(['checkout', '--detach', base]);
		runGit(['remote', 'set-url', 'origin']);
		for (const field of ['user.name', 'user.email']) {
			runGit(['config', field]);
		}
		runGit(['config', 'commit.gpgSign', 'false']);
		runGit(['config', 'tag.gpgSign', 'false']);

		const configuredPrefix = runNode<string>(
			releasePnpmCommand(cwd),
			{
				action: 'prefix',
				cwd: checkout,
			},
			cwd
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
		runNode(inspectReleaseCommand(cwd), {
			action: 'newer',
			refs: [...tags.keys()],
			prefix,
			version,
		});

		// The PR already bumped both manifests. pnpm creates an empty release marker
		// commit and an annotated tag, honoring tagVersionPrefix and the version hook.
		runNode(releasePnpmCommand(cwd), { action: 'version', version, cwd: checkout }, cwd);
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
		runNode(releaseDirectoryCommand(cwd), { action: 'remove', directory }, cwd);
	}
};

const runCli = (): void => {
	const args = process.argv.slice(2);
	if (args.length > 0)
		throw new Error(
			'Use pnpm release:check to validate or pnpm release:publish with no arguments'
		);
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
