import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Explicit tracked paths include force-added ignored files, but exclude local notes and dependencies.
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
	.split('\0')
	.filter(Boolean);
if (files.length > 0) {
	execFileSync(
		join(root, 'node_modules/.bin/secretlint'),
		['--no-gitignore', '--no-glob', '--', ...files],
		{ cwd: root, stdio: 'inherit' }
	);
}
