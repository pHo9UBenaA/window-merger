import { basename } from 'node:path';

type Command = { readonly executable: string; readonly args: readonly string[] };

export const pnpmCommand = (args: readonly string[], environment = process.env): Command => {
	const entry = environment.npm_execpath;
	const executable = entry && /^pnpm(?:[.-]|$)/i.test(basename(entry)) ? entry : 'pnpm';
	return /\.[cm]?js$/.test(executable)
		? { executable: process.execPath, args: [executable, ...args] }
		: { executable, args };
};
