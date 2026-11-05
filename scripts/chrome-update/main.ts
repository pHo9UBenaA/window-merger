import { hashChromeArchive } from '../lib/chrome-download.ts';
import { object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { writeChromeLock } from './write-lock.ts';

export const applyLockUpdate = async (input: unknown): Promise<void> => {
	const plan = object(input);
	const versions = object(plan.versions);
	const checksums = { ...object(plan.checksums) };
	if (!Array.isArray(plan.downloads)) throw new Error('Expected Chrome downloads');
	for (const value of plan.downloads) {
		const entry = object(value);
		const version = text(entry.version);
		const platform = text(entry.platform);
		const sha256 = await hashChromeArchive(version, platform);
		checksums[version] = { ...object(checksums[version] ?? {}), [platform]: sha256 };
	}
	await writeChromeLock(versions, checksums);
};

if (import.meta.main) await runJsonCli(applyLockUpdate);
