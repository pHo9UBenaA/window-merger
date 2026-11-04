import { join } from 'node:path';
import { build } from 'esbuild';
import { object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';

export const operate = async (input: unknown): Promise<void> => {
	const request = object(input);
	const major = text(request.major);
	if (!/^[1-9]\d*$/.test(major) || typeof request.minify !== 'boolean')
		throw new Error('Invalid compiler settings');
	await build({
		entryPoints: [join(process.cwd(), 'src/background.ts')],
		bundle: true,
		minify: request.minify,
		target: `chrome${major}`,
		format: 'esm',
		outdir: join(process.cwd(), 'dist'),
		platform: 'browser',
	});
};

if (import.meta.main) await runJsonCli(operate);
