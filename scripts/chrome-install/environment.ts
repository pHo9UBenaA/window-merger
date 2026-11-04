import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { choice, object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { chromeDirectory } from '../lib/script-paths.ts';

export const operate = async (input: unknown): Promise<string> => {
	const request = object(input);
	const directory = chromeDirectory(request.directory);
	const platform = choice(request.platform, ['linux64', 'win64', 'mac-arm64']);
	const major = text(request.major);
	if (!/^[1-9]\d*$/.test(major)) throw new Error('Invalid Chrome major');
	const binary =
		platform === 'win64'
			? 'chrome.exe'
			: platform === 'linux64'
				? 'chrome'
				: 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
	const executablePath = join(directory, `chrome-${platform}`, binary);
	if (/[\r\n]/.test(executablePath)) throw new Error('Invalid environment value');
	if (process.env.GITHUB_ENV)
		await appendFile(
			process.env.GITHUB_ENV,
			`CHROME_EXECUTABLE_PATH=${executablePath}\nCHROME_MAJOR=${major}\nHEADED=1\n`
		);
	return executablePath;
};

if (import.meta.main) await runJsonCli(operate);
