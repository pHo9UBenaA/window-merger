import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { snapshotDirectory } from '../runtime/paths.ts';
import { choice, object } from '../runtime/validation.ts';

export const operate = async (input: unknown): Promise<string | undefined> => {
	const request = object(input);
	if (choice(request.action, ['create', 'remove']) === 'create')
		return mkdtemp(join(process.cwd(), '.window-merger-index-'));
	await rm(snapshotDirectory(request.directory), { recursive: true, force: true });
};
