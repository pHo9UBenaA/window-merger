import { execFileSync } from 'node:child_process';

export const runNode = <T>(
	args: readonly string[],
	input: unknown = {},
	cwd = process.cwd()
): T => {
	const { NODE_OPTIONS: _options, ...env } = process.env;
	const output = execFileSync(process.execPath, args, {
		cwd,
		env,
		input: JSON.stringify(input),
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	return JSON.parse(output || 'null');
};
