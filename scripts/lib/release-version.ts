import { callOperation } from '../runtime/client.ts';
import { validateReleaseVersion, validateVersion } from './version.ts';

export { validateReleaseVersion } from './version.ts';

export const checkVersions = (commit: string, cwd = process.cwd()): string => {
	const read = (path: string): { version?: unknown } =>
		JSON.parse(callOperation<string>('git-read', { args: ['show', `${commit}:${path}`], cwd }));
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
