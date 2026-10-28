import { execFileSync } from 'node:child_process';
import { validateVersion } from './validate-extension.ts';

export const releaseVersion = (ref: string): string | null => {
	const refName = ref.replace(/^refs\/(heads|tags)\//, '');
	const match = /^(?:release\/)?v(\d+\.\d+\.\d+)$/.exec(refName);
	return match ? validateVersion(match[1]) : null;
};

export const checkRelease = (ref: string, commit: string, cwd = process.cwd()): string | null => {
	const version = releaseVersion(ref);
	if (version === null) return null;
	const manifest = JSON.parse(
		execFileSync('git', ['show', `${commit}:src/assets/manifest.json`], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		})
	);
	if (validateVersion(manifest.version) !== version) {
		throw new Error(`Release ${ref} does not match manifest version ${manifest.version}`);
	}
	return version;
};
