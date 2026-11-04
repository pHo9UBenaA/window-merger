import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { object } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { validateReleaseVersion } from '../lib/version.ts';

export const operate = (input: unknown): void => {
	const version = validateReleaseVersion(object(input).version);
	const path = join(process.cwd(), 'src/assets/manifest.json');
	const manifest = JSON.parse(readFileSync(path, 'utf8'));
	if (manifest.version !== version)
		writeFileSync(path, `${JSON.stringify({ ...manifest, version }, null, '\t')}\n`);
};

if (import.meta.main) await runJsonCli(operate);
