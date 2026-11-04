import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReleaseVersion } from '../lib/version.ts';
import { callOperation } from '../runtime/client.ts';

export const syncExtensionVersion = (cwd = process.cwd()): void => {
	const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
	callOperation('write-manifest', { version: validateReleaseVersion(pkg.version) });
};

if (import.meta.main) {
	try {
		syncExtensionVersion();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
