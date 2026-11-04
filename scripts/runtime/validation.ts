import { resolve, sep } from 'node:path';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const object = (value: unknown): Record<string, unknown> => {
	if (!isObject(value)) throw new Error('Expected an object');
	return value;
};

export const text = (value: unknown): string => {
	if (typeof value !== 'string' || value.includes('\0'))
		throw new Error('Expected text without NUL');
	return value;
};

export const strings = (value: unknown): string[] => {
	if (!Array.isArray(value)) throw new Error('Expected an array');
	return value.map(text);
};

export const inside = (directory: string, value: unknown): string => {
	const path = resolve(directory, text(value));
	if (!path.startsWith(`${resolve(directory)}${sep}`))
		throw new Error('Path must stay inside its directory');
	return path;
};

export const choice = <T extends string>(value: unknown, choices: readonly T[]): T => {
	const match = choices.find((entry) => entry === value);
	if (match === undefined) throw new Error(`Unsupported operation: ${String(value)}`);
	return match;
};

export const errorDetails = (error: unknown) => ({
	message: error instanceof Error ? error.message : String(error),
	...(error instanceof Error && 'code' in error ? { code: error.code } : {}),
	...(error instanceof Error && 'path' in error ? { path: error.path } : {}),
});
