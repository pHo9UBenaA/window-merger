import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { choice, inside, object, strings, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';

export const operate = async (input: unknown): Promise<void> => {
	const request = object(input);
	const directory = join(process.cwd(), 'dist');
	const action = choice(request.action, ['reset', 'sync']);
	if (action === 'reset') {
		await rm(directory, { recursive: true, force: true });
		await mkdir(directory, { recursive: true });
		return;
	}
	if (!Array.isArray(request.files)) throw new Error('Expected asset files');
	const files = request.files.map((value) => {
		const file = object(value);
		return { path: inside(directory, file.name), data: Buffer.from(text(file.data), 'base64') };
	});
	const removed = strings(request.removed).map((name) => inside(directory, name));
	for (const path of removed) await rm(path, { force: true });
	for (const { path, data } of files) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, data);
	}
};

if (import.meta.main) await runJsonCli(operate);
