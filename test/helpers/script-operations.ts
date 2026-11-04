import { vi } from 'vitest';
import { operate as archive } from '../../scripts/operations/archive';
import { operate as assets } from '../../scripts/operations/build-assets';
import { operate as bundle } from '../../scripts/operations/bundle';
import { operate as chromeDownload } from '../../scripts/operations/chrome-download';
import { operate as chromeEnvironment } from '../../scripts/operations/chrome-environment';
import { operate as chromeExtract } from '../../scripts/operations/chrome-extract';
import { operate as chromeLock } from '../../scripts/operations/chrome-lock';
import { operate as exportIndex } from '../../scripts/operations/export-index';
import { operate as gitRead } from '../../scripts/operations/git-read';
import { operate as pnpmReport } from '../../scripts/operations/pnpm-report';
import { operate as releaseDirectory } from '../../scripts/operations/release-directory';
import { operate as releaseGit } from '../../scripts/operations/release-git';
import { operate as releasePnpm } from '../../scripts/operations/release-pnpm';
import { operate as snapshot } from '../../scripts/operations/snapshot';
import { operate as writeManifest } from '../../scripts/operations/write-manifest';

const operations: Readonly<Record<string, (input: unknown) => unknown>> = {
	archive,
	'build-assets': assets,
	bundle,
	'export-index': exportIndex,
	'git-read': gitRead,
	'chrome-download': chromeDownload,
	'chrome-environment': chromeEnvironment,
	'chrome-extract': chromeExtract,
	'chrome-lock': chromeLock,
	'pnpm-report': pnpmReport,
	'release-directory': releaseDirectory,
	'release-git': releaseGit,
	'release-pnpm': releasePnpm,
	snapshot,
	'write-manifest': writeManifest,
};

export const runOperation = (name: string, input: unknown): unknown => {
	const operation = operations[name];
	if (!operation) throw new Error(`Unexpected test operation: ${name}`);
	return operation(input);
};

export const useOperationRoot = (root: string): void => {
	vi.spyOn(process, 'cwd').mockReturnValue(root);
};
