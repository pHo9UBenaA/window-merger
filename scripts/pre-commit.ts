import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hasCodeChanges = (root: string): boolean => {
	// Include both sides of renames, including code renamed to a Markdown file.
	const changed = execFileSync('git', ['diff', '--cached', '--name-only', '--no-renames', '-z'], {
		cwd: root,
		encoding: 'utf8',
	});
	return changed.split('\0').some((path) => path.length > 0 && !path.endsWith('.md'));
};

export const withIndexSnapshot = async (
	root: string,
	verify: (snapshot: string, files: string[], env: NodeJS.ProcessEnv) => Promise<void>
): Promise<void> => {
	const snapshot = await mkdtemp(join(tmpdir(), 'window-merger-index-'));
	try {
		execFileSync('git', ['checkout-index', '--all', `--prefix=${snapshot}${sep}`], {
			cwd: root,
		});
		const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
			.split('\0')
			.filter(Boolean);
		const env = { ...process.env };
		const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], {
			cwd: root,
			encoding: 'utf8',
		});
		for (const name of localVariables.trim().split('\n')) delete env[name];
		await symlink(join(root, 'node_modules'), join(snapshot, 'node_modules'), 'junction');
		await verify(snapshot, files, env);
	} finally {
		await rm(snapshot, { recursive: true, force: true });
	}
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
			encoding: 'utf8',
		}).trim();
		const checkCode = hasCodeChanges(root);
		await withIndexSnapshot(root, async (snapshot, files, env) => {
			const run = (tool: string, args: string[]) =>
				execFileSync(join(root, 'node_modules/.bin', tool), args, {
					cwd: snapshot,
					env,
					stdio: 'inherit',
				});
			run('secretlint', ['--no-gitignore', '--no-glob', '--', ...files]);
			if (!checkCode) return;
			run('biome', ['ci', '--vcs-enabled=false', '.', '--error-on-warnings']);
			run('tsgo', []);
			run('vitest', ['run']);
		});
	} catch (error) {
		console.error('Staged snapshot checks failed:', error);
		process.exitCode = 1;
	}
}
