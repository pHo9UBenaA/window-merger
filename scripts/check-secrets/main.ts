import { runJsonCli } from '../lib/json-cli.ts';

const prepareSecretCheck = (trackedPaths: unknown) => {
	if (typeof trackedPaths !== 'string') throw new Error('Expected Git tracked paths');
	return { tool: 'secretlint', files: trackedPaths.split('\0').filter(Boolean) };
};

if (import.meta.main) await runJsonCli(prepareSecretCheck);
