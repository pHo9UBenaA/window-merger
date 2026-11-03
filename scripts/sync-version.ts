import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReleaseVersion } from './lib/release-version.ts';

export const syncExtensionVersion = (cwd = process.cwd()): void => {
	const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
	const version = validateReleaseVersion(pkg.version);
	const manifestPath = join(cwd, 'src/assets/manifest.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (manifest.version !== version) {
		manifest.version = version;
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
	}
	// pnpm stages package.json itself; include the extension version in that commit.
	execFileSync('git', ['add', '--', 'src/assets/manifest.json'], { cwd });
};

if (import.meta.main) {
	try {
		syncExtensionVersion();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
