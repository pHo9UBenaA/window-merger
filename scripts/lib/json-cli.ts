import { readFileSync } from 'node:fs';
import { errorDetails } from './input.ts';

export const readJsonInput = (): unknown => JSON.parse(readFileSync(0, 'utf8'));

export const runJsonCli = async (execute: (input: unknown) => unknown): Promise<void> => {
	try {
		const result = await execute(readJsonInput());
		if (result !== undefined) console.log(JSON.stringify(result));
	} catch (error) {
		console.error(JSON.stringify(errorDetails(error)));
		process.exitCode = 1;
	}
};
