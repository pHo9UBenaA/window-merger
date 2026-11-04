import { join } from 'node:path';
import { runJsonCli } from '../lib/json-cli.ts';
import { validateExtension } from '../lib/validate-extension.ts';

export const validatePackage = async (): Promise<void> =>
	validateExtension(join(process.cwd(), 'dist'));
if (import.meta.main) await runJsonCli(validatePackage);
