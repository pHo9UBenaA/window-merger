import { resolve } from 'node:path';
import { checkToolsCommand, gitReadCommand } from '../lib/commands.generated.ts';
import { runNode } from '../lib/run-node.ts';
import { exportIndexCommand, snapshotCommand } from './commands.generated.ts';

export const hasCodeChanges = (repository: string): boolean => {
	const root = resolve(repository);
	return runNode<string>(
		gitReadCommand(root),
		{
			args: ['diff', '--cached', '--name-only', '--no-renames', '-z'],
			cwd: root,
		},
		root
	)
		.split('\0')
		.some((path) => path.length > 0 && !path.endsWith('.md'));
};

export const withIndexSnapshot = async (
	repository: string,
	verify: (snapshotDirectory: string, trackedFiles: string[]) => Promise<void>
): Promise<void> => {
	const root = resolve(repository);
	const directory = runNode<string>(snapshotCommand(root), { action: 'create' }, root);
	try {
		runNode(exportIndexCommand(root), { directory }, root);
		const files = runNode<string>(
			gitReadCommand(root),
			{ args: ['ls-files', '-z'], cwd: root },
			root
		)
			.split('\0')
			.filter(Boolean);
		await verify(directory, files);
	} finally {
		runNode(snapshotCommand(root), { action: 'remove', directory }, root);
	}
};

if (import.meta.main) {
	try {
		const root = process.cwd();
		const checkCode = hasCodeChanges(root);
		await withIndexSnapshot(root, async (snapshot, files) => {
			runNode(checkToolsCommand(root), { tool: 'secretlint', snapshot, files });
			if (checkCode) runNode(checkToolsCommand(root), { tool: 'biome', snapshot });
		});
	} catch (error) {
		console.error('Staged snapshot checks failed:', error);
		process.exitCode = 1;
	}
}
