import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';

export const operate = async (input: unknown): Promise<void> => {
	const request = object(input);
	const versions = object(request.versions);
	const checksums = object(request.checksums);
	for (const [major, version] of Object.entries(versions)) {
		if (
			!/^[1-9]\d*$/.test(major) ||
			!new RegExp(`^${major}\\.\\d+\\.\\d+\\.\\d+$`).test(text(version))
		)
			throw new Error('Invalid locked Chrome version');
	}
	for (const [version, platforms] of Object.entries(checksums)) {
		if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid checksum version');
		for (const hash of Object.values(object(platforms)))
			if (!/^[a-f0-9]{64}$/.test(text(hash))) throw new Error('Invalid Chrome SHA-256');
	}
	const directory = join(process.cwd(), 'test/browser');
	await writeFile(
		join(directory, 'chrome-checksums.json'),
		`${JSON.stringify(checksums, null, '\t')}\n`
	);
	await writeFile(
		join(directory, 'chrome-versions.json'),
		`${JSON.stringify(versions, null, '\t')}\n`
	);
};

if (import.meta.main) await runJsonCli(operate);
