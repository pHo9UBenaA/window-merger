import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { choice, object } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { snapshotDirectory } from '../lib/script-paths.ts';

export const operate = async (input: unknown): Promise<string | undefined> => {
	const request = object(input);
	if (choice(request.action, ['create', 'remove']) === 'create')
		return mkdtemp(join(process.cwd(), '.window-merger-index-'));
	await rm(snapshotDirectory(request.directory), { recursive: true, force: true });
};

if (import.meta.main) await runJsonCli(operate);
