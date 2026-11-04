import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReleaseVersion } from '../lib/version.ts';

export const readPackageVersion = (root = process.cwd()) => {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	return { version: validateReleaseVersion(pkg.version) };
};

if (import.meta.main) {
	try {
		console.log(JSON.stringify(readPackageVersion()));
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
