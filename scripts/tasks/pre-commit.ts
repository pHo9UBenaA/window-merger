import { callOperation } from '../runtime/client.ts';

export const hasCodeChanges = (root: string): boolean =>
	callOperation<string>('git-read', {
		args: ['diff', '--cached', '--name-only', '--no-renames', '-z'],
		cwd: root,
	})
		.split('\0')
		.some((path) => path.length > 0 && !path.endsWith('.md'));

export const withIndexSnapshot = async (
	root: string,
	verify: (
		snapshotDirectory: string,
		trackedFiles: string[],
		environment: NodeJS.ProcessEnv
	) => Promise<void>
): Promise<void> => {
	const directory = await callOperation<string>('snapshot', { action: 'create' });
	try {
		callOperation('export-index', { directory });
		const files = callOperation<string>('git-read', { args: ['ls-files', '-z'], cwd: root })
			.split('\0')
			.filter(Boolean);
		const variables = callOperation<string>('git-read', {
			args: ['rev-parse', '--local-env-vars'],
			cwd: root,
		})
			.trim()
			.split('\n');
		const environment = Object.fromEntries(
			Object.entries(process.env).filter(([name]) => !variables.includes(name))
		);
		await verify(directory, files, environment);
	} finally {
		await callOperation('snapshot', { action: 'remove', directory });
	}
};

if (import.meta.main) {
	try {
		const root = process.cwd();
		const checkCode = hasCodeChanges(root);
		await withIndexSnapshot(root, async (snapshot, files) => {
			callOperation('check-tools', { tool: 'secretlint', snapshot, files });
			if (checkCode) callOperation('check-tools', { tool: 'biome', snapshot });
		});
	} catch (error) {
		console.error('Staged snapshot checks failed:', error);
		process.exitCode = 1;
	}
}
