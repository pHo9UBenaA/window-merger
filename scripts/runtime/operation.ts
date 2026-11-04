import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { errorDetails } from './validation.ts';

try {
	const { operate } = await import(pathToFileURL(process.argv[2]).href);
	const value = await operate(JSON.parse(readFileSync(0, 'utf8')));
	console.log(JSON.stringify({ value: value ?? null }));
} catch (error) {
	console.log(JSON.stringify({ error: errorDetails(error) }));
}
