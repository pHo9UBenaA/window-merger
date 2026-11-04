import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { choice, object } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { temporaryDirectory } from '../lib/script-paths.ts';

export const operate = (input: unknown): string | undefined => {
	const request = object(input);
	if (choice(request.action, ['create', 'remove']) === 'create')
		return mkdtempSync(join(tmpdir(), 'window-merger-release-'));
	rmSync(temporaryDirectory(request.directory, tmpdir(), 'window-merger-release-'), {
		recursive: true,
		force: true,
	});
};

if (import.meta.main) await runJsonCli(operate);
