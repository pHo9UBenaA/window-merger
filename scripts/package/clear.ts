import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runJsonCli } from '../lib/json-cli.ts';

const clearArchive = async (): Promise<void> => {
	await rm(join(process.cwd(), 'dist.zip'), { force: true });
	await rm(join(process.cwd(), 'dist.tmp.zip'), { force: true });
};

if (import.meta.main) await runJsonCli(clearArchive, () => undefined);
