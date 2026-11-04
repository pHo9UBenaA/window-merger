import { join, resolve } from 'node:path';
import { object, text } from './validation.ts';

export const createOperationScope = (root: string, task: string) => {
	const snapshots = new Set<string>();
	const releases = new Set<string>();
	const downloads = new Set<string>();
	const requireOwned = (paths: ReadonlySet<string>, value: unknown) => {
		if (!paths.has(text(value))) throw new Error('Temporary path does not belong to this task');
	};
	return {
		check(operation: string, value: unknown): void {
			const input = object(value);
			if (operation === 'snapshot' && input.action === 'remove')
				requireOwned(snapshots, input.directory);
			if (operation === 'export-index') requireOwned(snapshots, input.directory);
			if (operation === 'check-tools' && input.snapshot !== undefined)
				requireOwned(snapshots, input.snapshot);
			if (operation === 'release-directory' && input.action === 'remove')
				requireOwned(releases, input.directory);
			if (
				operation === 'release-git' ||
				operation === 'release-pnpm' ||
				(operation === 'git-read' &&
					input.cwd !== undefined &&
					resolve(text(input.cwd)) !== root)
			)
				requireOwned(
					new Set([...releases].map((directory) => join(directory, 'checkout'))),
					input.cwd
				);
			if (operation === 'chrome-download') {
				if (input.purpose !== (task === 'chrome-install' ? 'install' : 'hash'))
					throw new Error('Download purpose is not permitted');
				if (input.remove !== undefined) requireOwned(downloads, input.remove);
			}
			if (operation === 'chrome-extract' || operation === 'chrome-environment')
				requireOwned(downloads, input.directory);
		},
		record(operation: string, inputValue: unknown, result: unknown): void {
			const input = object(inputValue);
			if (operation === 'snapshot' && input.action === 'create') snapshots.add(text(result));
			if (operation === 'snapshot' && input.action === 'remove')
				snapshots.delete(text(input.directory));
			if (operation === 'release-directory' && input.action === 'create')
				releases.add(text(result));
			if (operation === 'release-directory' && input.action === 'remove')
				releases.delete(text(input.directory));
			if (
				operation === 'chrome-download' &&
				input.purpose === 'install' &&
				input.remove === undefined
			)
				downloads.add(text(object(result).directory));
			if (operation === 'chrome-download' && input.remove !== undefined)
				downloads.delete(text(input.remove));
		},
	};
};
