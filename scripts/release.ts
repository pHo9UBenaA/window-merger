import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateVersion } from './validate-extension.ts';

export const releaseVersion = (ref: string): string | null => {
	const name = ref.replace(/^refs\/(heads|tags)\//, '');
	const match = /^(?:release\/)?v(\d+\.\d+\.\d+)$/.exec(name);
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
		if (/^0+$/.test(commit)) continue;
		checkRelease(localRef, commit, cwd);
		checkRelease(remoteRef, commit, cwd);
	}
};

const compareVersions = (a: string, b: string): number => {
	const left = a.split('.').map(Number);
	const right = b.split('.').map(Number);
	for (let index = 0; index < 3; index++) {
		const difference = left[index] - right[index];
		if (difference !== 0) return difference;
	}
	return 0;
};

export const createReleaseTag = (
	ref: string,
	commit: string,
	cwd = process.cwd(),
	remote = 'origin'
): 'created' | 'existing' | 'skipped' => {
	const version = checkRelease(ref, commit, cwd);
	if (version === null) return 'skipped';
	const sha = git(['rev-parse', `${commit}^{commit}`], cwd);
	const tag = `v${version}`;
	const remoteTags = () => {
		const tags = new Map<string, string>();
		for (const line of git(['ls-remote', '--tags', remote], cwd).split('\n')) {
			const [hash, name] = line.split(/\s+/);
			if (name) tags.set(name, hash);
		}

		return tags;
	};
	const tags = remoteTags();
	const existing = tags.get(`refs/tags/${tag}^{}`) ?? tags.get(`refs/tags/${tag}`);
	if (existing) {
		if (existing !== sha) throw new Error(`Tag ${tag} already points to a different commit`);
		return 'existing';
	}
	for (const name of tags.keys()) {
		const published = releaseVersion(name);
		if (published && compareVersions(published, version) >= 0) {
			throw new Error(`Release ${version} is not newer than published version ${published}`);
		}
	}
	try {
		// Publish the verified commit directly; local tags are neither created nor consulted.
		git(['push', remote, `${sha}:refs/tags/${tag}`], cwd);
	} catch (error) {
		// A concurrent run or a lost response may have published this exact tag already.
		const latest = remoteTags();
		if ((latest.get(`refs/tags/${tag}^{}`) ?? latest.get(`refs/tags/${tag}`)) !== sha)
			throw error;
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
