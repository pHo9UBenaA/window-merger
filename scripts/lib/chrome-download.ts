import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { choice, object, text } from './input.ts';
import { runJsonCli } from './json-cli.ts';
import { archivePath, chromeDirectory } from './script-paths.ts';

const archiveUrl = (version: unknown, platform: unknown): string => {
	const release = text(version);
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(release)) throw new Error('Invalid Chrome archive version');
	const target = choice(platform, ['linux64', 'win64', 'mac-arm64']);
	return `https://storage.googleapis.com/chrome-for-testing-public/${release}/${target}/chrome-${target}.zip`;
};

const downloadArchive = async (url: string) => {
	const response = await fetch(url, {
		redirect: 'error',
		signal: AbortSignal.timeout(300_000),
	});
	const body = response.body;
	if (!response.ok || !body) throw new Error(`Chrome download failed (HTTP ${response.status})`);
	return body;
};

export const hashChromeArchive = async (version: string, platform: string): Promise<string> => {
	const hash = createHash('sha256');
	for await (const chunk of await downloadArchive(archiveUrl(version, platform)))
		hash.update(chunk);
	return hash.digest('hex');
};

const installArchive = async (input: unknown) => {
	const request = object(input);
	if (request.remove !== undefined) {
		await rm(chromeDirectory(request.remove), { recursive: true, force: true });
		return;
	}
	const url = archiveUrl(request.version, request.platform);
	const directory = await mkdtemp(
		join(process.env.RUNNER_TEMP ?? tmpdir(), 'window-merger-chrome-install-')
	);
	try {
		const body = await downloadArchive(url);
		const hash = createHash('sha256');
		async function* hashChunks() {
			for await (const chunk of body) {
				hash.update(chunk);
				yield chunk;
			}
		}
		await pipeline(Readable.from(hashChunks()), createWriteStream(archivePath(directory)));
		return { directory, sha256: hash.digest('hex') };
	} catch (error) {
		await rm(directory, { recursive: true, force: true });
		throw error;
	}
};

if (import.meta.main) await runJsonCli(installArchive);
