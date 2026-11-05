import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { checkSecrets } from '../../scripts/check-secrets/main';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
afterEach(() => {
	vi.resetAllMocks();
});

it.each([
	{ help: 'dir [flags] [path...]', args: ['dir', '--verbose'] },
	{ help: 'filesystem (fs) [<path> ...]', args: ['filesystem'] },
])('requests finding details using the installed CLI: $help', ({ help, args }) => {
	vi.mocked(execFileSync).mockReturnValue(help);
	checkSecrets('file with spaces\nand newline.txt\0--leading-dash.txt\0');
	expect(execFileSync).toHaveBeenLastCalledWith(
		'betterleaks',
		[
			...args,
			'--redact',
			'--no-banner',
			'--',
			join(process.cwd(), 'file with spaces\nand newline.txt'),
			join(process.cwd(), '--leading-dash.txt'),
		],
		{ stdio: ['ignore', 'inherit', 'inherit'] }
	);
});

it('checks tool availability but does not scan the working directory for an empty file list', () => {
	vi.mocked(execFileSync).mockReturnValue('filesystem');
	checkSecrets('');
	expect(execFileSync).toHaveBeenCalledExactlyOnceWith('betterleaks', ['--help'], {
		encoding: 'utf8',
	});
});

it('warns and fails rather than silently skipping a missing Betterleaks installation', () => {
	vi.mocked(execFileSync).mockImplementation(() => {
		throw Object.assign(new Error('spawn betterleaks ENOENT'), { code: 'ENOENT' });
	});
	expect(() => checkSecrets('')).toThrow('Warning: betterleaks is not installed or not on PATH');
});

it('propagates scanner failures', () => {
	const failure = new Error('scanner failed');
	vi.mocked(execFileSync)
		.mockReturnValueOnce('filesystem')
		.mockImplementationOnce(() => {
			throw failure;
		});
	expect(() => checkSecrets('tracked.txt\0')).toThrow(failure);
});

it.each([null, { message: 'Git failed' }, '../outside\0'])(
	'rejects invalid Git output or paths before starting Betterleaks: %j',
	(input) => {
		expect(() => checkSecrets(input)).toThrow();
		expect(execFileSync).not.toHaveBeenCalled();
	}
);
