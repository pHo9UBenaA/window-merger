import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { choice, object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { archivePath, chromeDirectory } from '../lib/script-paths.ts';

const operate = async (input: unknown): Promise<void> => {
	const request = object(input);
	const directory = chromeDirectory(request.directory);
	const platform = choice(request.platform, ['linux64', 'win64', 'mac-arm64']);
	const versions = JSON.parse(
		await readFile(join(process.cwd(), 'test/browser/chrome-versions.json'), 'utf8')
	);
	const checksums = JSON.parse(
		await readFile(join(process.cwd(), 'test/browser/chrome-checksums.json'), 'utf8')
	);
	const expected = checksums[versions[text(request.major)]]?.[platform];
	if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
		throw new Error('Missing or invalid Chrome SHA-256');
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(archivePath(directory))) hash.update(chunk);
	if (hash.digest('hex') !== expected)
		throw new Error('Chrome SHA-256 mismatch; refusing to extract');
	try {
		execFileSync('unzip', ['-q', archivePath(directory), '-d', directory], {
			stdio: ['ignore', 'ignore', 'pipe'],
		});
	} finally {
		await rm(archivePath(directory), { force: true });
	}
};

if (import.meta.main) await runJsonCli(operate);
