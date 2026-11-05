import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { choice, object, text } from './input.ts';
import { runJsonCli } from './json-cli.ts';
import { archivePath, temporaryDirectory } from './script-paths.ts';

export const operate = async (
	input: unknown,
	hashPrefix = join(tmpdir(), 'window-merger-chrome-hash-')
) => {
	const request = object(input);
	const purpose = choice(request.purpose, ['install', 'hash']);
	const prefix =
		purpose === 'install'
			? join(process.env.RUNNER_TEMP ?? tmpdir(), 'window-merger-chrome-install-')
			: hashPrefix;
	if (request.remove !== undefined) {
		await rm(temporaryDirectory(request.remove, dirname(prefix), basename(prefix)), {
			recursive: true,
			force: true,
		});
		return;
	}
	const version = text(request.version);
	const platform = choice(request.platform, ['linux64', 'win64', 'mac-arm64']);
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Chrome archive version');
	const directory = await mkdtemp(prefix);
	try {
		const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chrome-${platform}.zip`;
		const response = await fetch(url, {
			redirect: 'error',
			signal: AbortSignal.timeout(300_000),
		});
		if (!response.ok || !response.body)
			throw new Error(`Chrome download failed (HTTP ${response.status})`);
		const hash = createHash('sha256');
		async function* hashChunks() {
			if (!response.body) return;
			for await (const chunk of response.body) {
				hash.update(chunk);
				yield chunk;
			}
		}
		await pipeline(Readable.from(hashChunks()), createWriteStream(archivePath(directory)));
		const sha256 = hash.digest('hex');
		if (purpose === 'hash') await rm(directory, { recursive: true, force: true });
		return { directory, sha256 };
	} catch (error) {
		await rm(directory, { recursive: true, force: true });
		throw error;
	}
};

if (import.meta.main) await runJsonCli(operate);
