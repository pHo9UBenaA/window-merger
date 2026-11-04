import { join } from 'node:path';
import { validateExtension } from '../lib/validate-extension.ts';
import { callOperation } from '../runtime/client.ts';
import { buildExtension } from './build.ts';

export const packageExtension = async (root = process.cwd()): Promise<void> => {
	await callOperation('archive', { action: 'clear' });
	await buildExtension({ root });
	await validateExtension(join(root, 'dist'));
	await callOperation('archive', { action: 'create' });
};

if (import.meta.main) {
	try {
		await packageExtension();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
