import { resolve } from 'node:path';
import { buildExtension } from '../build/main.ts';
import { runNode } from '../lib/run-node.ts';
import { archiveCommand, validatePackageCommand } from './commands.generated.ts';

export const packageExtension = async (directory = process.cwd()): Promise<void> => {
	const root = resolve(directory);
	await runNode(archiveCommand(root), { action: 'clear' }, root);
	await buildExtension({ root });
	await runNode(validatePackageCommand(root), {}, root);
	await runNode(archiveCommand(root), { action: 'create' }, root);
};

if (import.meta.main) {
	try {
		await packageExtension();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
