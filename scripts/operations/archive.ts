import { execFileSync } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { choice, object } from '../runtime/validation.ts';

export const operate = async (input: unknown): Promise<void> => {
	const action = choice(object(input).action, ['clear', 'create']);
	const archive = join(process.cwd(), 'dist.zip');
	const temporary = join(process.cwd(), 'dist.tmp.zip');
	if (action === 'clear') {
		await rm(archive, { force: true });
		await rm(temporary, { force: true });
		return;
	}
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
