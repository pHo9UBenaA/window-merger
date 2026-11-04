import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { temporaryDirectory } from '../runtime/paths.ts';
import { choice, object } from '../runtime/validation.ts';

export const operate = (input: unknown): string | undefined => {
	const request = object(input);
	if (choice(request.action, ['create', 'remove']) === 'create')
		return mkdtempSync(join(tmpdir(), 'window-merger-release-'));
	rmSync(temporaryDirectory(request.directory, tmpdir(), 'window-merger-release-'), {
		recursive: true,
		force: true,
	});
};
