import { relative, sep } from 'node:path';
import { vi } from 'vitest';
import { operate as bundle } from '../../scripts/build/bundle';
import { prepareAssets } from '../../scripts/build/prepare-assets';
import { operate as assets } from '../../scripts/build/write-assets';
import { operate as chromeEnvironment } from '../../scripts/chrome-install/environment';
import { operate as chromeExtract } from '../../scripts/chrome-install/extract';
import { prepareInstallation } from '../../scripts/chrome-install/read';
import { operate as chromeDownload } from '../../scripts/lib/chrome-download';
import { operate as gitRead } from '../../scripts/lib/git-read';
import { PROJECT_ROOT } from '../../scripts/lib/project-root';
import { operate as exportIndex } from '../../scripts/pre-commit/export-index';
import { operate as snapshot } from '../../scripts/pre-commit/snapshot';
import { operate as releaseDirectory } from '../../scripts/release/directory';
import { operate as releaseGit } from '../../scripts/release/git';
import { inspectRelease } from '../../scripts/release/inspect';
import { operate as releasePnpm } from '../../scripts/release/pnpm';
import { validateVersions } from '../../scripts/release/validate-versions';

const executables: Readonly<Record<string, (input: unknown) => unknown>> = {
	'scripts/build/bundle.ts': bundle,
	'scripts/build/prepare-assets.ts': prepareAssets,
	'scripts/build/write-assets.ts': assets,
	'scripts/lib/git-read.ts': gitRead,
	'scripts/lib/chrome-download.ts': chromeDownload,
	'scripts/chrome-install/read.ts': prepareInstallation,
	'scripts/chrome-install/environment.ts': chromeEnvironment,
	'scripts/chrome-install/extract.ts': chromeExtract,
	'scripts/pre-commit/export-index.ts': exportIndex,
	'scripts/pre-commit/snapshot.ts': snapshot,
	'scripts/release/directory.ts': releaseDirectory,
	'scripts/release/git.ts': releaseGit,
	'scripts/release/pnpm.ts': releasePnpm,
	'scripts/release/inspect.ts': inspectRelease,
	'scripts/release/validate-versions.ts': validateVersions,
};

export const runScript = (command: readonly string[], input: unknown = {}): unknown => {
	const file = command.at(-1);
	if (!file) throw new Error('Missing script path');
	const name = relative(PROJECT_ROOT, file).split(sep).join('/');
	const execute = executables[name];
	if (!execute) throw new Error(`Unexpected test script: ${name}`);
	return execute(input);
};

export const useOperationRoot = (root: string): void => {
	vi.spyOn(process, 'cwd').mockReturnValue(root);
};
