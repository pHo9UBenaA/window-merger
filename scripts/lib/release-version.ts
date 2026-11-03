import { execFileSync } from 'node:child_process';
import { validateVersion } from './validate-extension.ts';

export const validateReleaseVersion = (version: unknown): string => {
	const valid = validateVersion(version);
	if (!/^\d+\.\d+\.\d+$/.test(valid)) {
		throw new Error('Release versions must have three numeric components');
	}
	return valid;
};

export const checkVersions = (commit: string, cwd = process.cwd()): string => {
	const read = (path: string): { version?: unknown } =>
		JSON.parse(
			execFileSync('git', ['show', `${commit}:${path}`], {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			})
		);
	const version = validateReleaseVersion(read('package.json').version);
	const manifest = read('src/assets/manifest.json');
	if (validateVersion(manifest.version) !== version) {
		throw new Error(
			`Package version ${version} does not match manifest version ${manifest.version}`
		);
	}
	return version;
};

export const releaseVersion = (ref: string): string | null => {
	const refName = ref.replace(/^refs\/(heads|tags)\//, '');
	const match = /^(?:release\/)?v(\d+\.\d+\.\d+)$/.exec(refName);
	return match ? validateVersion(match[1]) : null;
};

export const checkRelease = (ref: string, commit: string, cwd = process.cwd()): string | null => {
	const version = releaseVersion(ref);
	if (version === null) return null;
	const packageVersion = checkVersions(commit, cwd);
	if (packageVersion !== version) {
		throw new Error(`Release ${ref} does not match package version ${packageVersion}`);
	}
	return version;
};
