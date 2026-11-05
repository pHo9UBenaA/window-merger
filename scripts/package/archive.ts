import { execFileSync } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runJsonCli } from '../lib/json-cli.ts';

const createArchive = async (): Promise<void> => {
	const archive = join(process.cwd(), 'dist.zip');
	const temporary = join(process.cwd(), 'dist.tmp.zip');
	try {
		execFileSync('zip', ['-qr9', '-X', '-D', temporary, '.', '-x', '*.DS_Store'], {
			cwd: join(process.cwd(), 'dist'),
			stdio: ['ignore', 'ignore', 'inherit'],
		});
		await rename(temporary, archive);
	} finally {
		await rm(temporary, { force: true });
	}
};

if (import.meta.main) await runJsonCli(createArchive, () => undefined);
