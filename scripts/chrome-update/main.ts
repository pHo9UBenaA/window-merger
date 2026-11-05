import { join } from 'node:path';
import { operate as downloadChrome } from '../lib/chrome-download.ts';
import { object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { operate as writeLock } from './write-lock.ts';

export const applyLockUpdate = async (input: unknown): Promise<void> => {
	const plan = object(input);
	const versions = object(plan.versions);
	const checksums = { ...object(plan.checksums) };
	if (!Array.isArray(plan.downloads)) throw new Error('Expected Chrome downloads');
	for (const value of plan.downloads) {
		const entry = object(value);
		const version = text(entry.version);
		const platform = text(entry.platform);
		// A project-local prefix avoids a launcher just to expand the temporary-directory grant.
		const download = await downloadChrome(
			{ purpose: 'hash', version, platform },
			join(process.cwd(), '.window-merger-chrome-hash-')
		);
		if (!download) throw new Error('Chrome download did not return a checksum');
		checksums[version] = { ...object(checksums[version] ?? {}), [platform]: download.sha256 };
	}
	await writeLock({ checksums, versions });
};

if (import.meta.main) await runJsonCli(applyLockUpdate);
