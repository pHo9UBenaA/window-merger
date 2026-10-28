import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

export const hasCodeChanges = (root: string): boolean => {
	// Include both sides of renames, including code renamed to a Markdown file.
	const stagedPathsOutput = execFileSync(
		'git',
		['diff', '--cached', '--name-only', '--no-renames', '-z'],
		{
			cwd: root,
			encoding: 'utf8',
		}
	);
	return stagedPathsOutput.split('\0').some((path) => path.length > 0 && !path.endsWith('.md'));
};

const createSnapshotEnvironment = (root: string): NodeJS.ProcessEnv => {
	const environment = { ...process.env };
	const localGitVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], {
		cwd: root,
		encoding: 'utf8',
	});
	// Snapshot tools must not inherit paths to the original repository or its index.
	for (const name of localGitVariables.trim().split('\n')) delete environment[name];
	return environment;
};

export const withIndexSnapshot = async (
	root: string,
	verify: (
		snapshotDirectory: string,
		trackedFiles: string[],
		environment: NodeJS.ProcessEnv
	) => Promise<void>
): Promise<void> => {
	const snapshotDirectory = await mkdtemp(join(tmpdir(), 'window-merger-index-'));
	try {
		execFileSync('git', ['checkout-index', '--all', `--prefix=${snapshotDirectory}${sep}`], {
			cwd: root,
		});
		const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
			cwd: root,
			encoding: 'utf8',
		})
			.split('\0')
			.filter(Boolean);
		const environment = createSnapshotEnvironment(root);
		await symlink(
			join(root, 'node_modules'),
			join(snapshotDirectory, 'node_modules'),
			'junction'
		);
		await verify(snapshotDirectory, trackedFiles, environment);
	} finally {
		await rm(snapshotDirectory, { recursive: true, force: true });
	}
};

if (import.meta.main) {
	try {
		const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
			encoding: 'utf8',
		}).trim();
		const shouldCheckCode = hasCodeChanges(root);
		await withIndexSnapshot(root, async (snapshotDirectory, trackedFiles, environment) => {
			const run = (tool: string, args: string[]) =>
				execFileSync(join(root, 'node_modules/.bin', tool), args, {
					cwd: snapshotDirectory,
					env: environment,
					stdio: 'inherit',
				});
			run('secretlint', ['--no-gitignore', '--no-glob', '--', ...trackedFiles]);
			if (!shouldCheckCode) return;
			run('biome', ['ci', '--vcs-enabled=false', '.', '--error-on-warnings']);
		});
	} catch (error) {
		console.error('Staged snapshot checks failed:', error);
		process.exitCode = 1;
	}
}
