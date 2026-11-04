import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { text } from '../runtime/validation.ts';

export const temporaryDirectory = (value: unknown, base: string, prefix: string): string => {
	const path = resolve(text(value));
	if (
		dirname(path) !== resolve(base) ||
		!basename(path).startsWith(prefix) ||
		basename(path) === prefix
	)
		throw new Error('Unexpected temporary directory');
	return path;
};

export const snapshotDirectory = (value: unknown): string =>
	temporaryDirectory(value, process.cwd(), '.window-merger-index-');

export const releaseCheckout = (value: unknown): string => {
	const path = resolve(text(value));
	if (basename(path) !== 'checkout') throw new Error('Expected release checkout');
	temporaryDirectory(dirname(path), tmpdir(), 'window-merger-release-');
	return path;
};

export const chromeDirectory = (value: unknown): string =>
	temporaryDirectory(value, process.env.RUNNER_TEMP ?? tmpdir(), 'window-merger-chrome-install-');

export const gitDirectory = (value: unknown): string => {
	if (value === undefined || resolve(text(value)) === process.cwd()) return process.cwd();
	return releaseCheckout(value);
};

export const checkedRef = (value: unknown): string => {
	const ref = text(value);
	if (!ref || ref.startsWith('-') || /[\s\p{Cc}]/u.test(ref)) throw new Error('Invalid Git ref');
	return ref;
};

export const archivePath = (directory: string): string => join(directory, 'chrome.zip');
