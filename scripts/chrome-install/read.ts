import { readInstallation } from '../lib/chrome-compat.ts';
import { object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';

export const prepareInstallation = (input: unknown) => {
	const request = object(input);
	return readInstallation(text(request.major), text(request.platform));
};
if (import.meta.main) await runJsonCli(prepareInstallation);
