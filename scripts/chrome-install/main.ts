import type { ChromeInstallation } from '../lib/chrome-compat.ts';
import { chromeDownloadCommand } from '../lib/commands.generated.ts';
import { runNode } from '../lib/run-node.ts';
import {
	chromeEnvironmentCommand,
	chromeExtractCommand,
	readChromeInstallationCommand,
} from './commands.generated.ts';

export const installChrome = (major: string, platform: string): void => {
	const { version, expectedSha256 } = runNode<ChromeInstallation>(
		readChromeInstallationCommand(),
		{ major, platform }
	);
	const { directory, sha256 } = runNode<{ directory: string; sha256: string }>(
		chromeDownloadCommand(),
		{ version, platform }
	);
	try {
		if (sha256 !== expectedSha256)
			throw new Error(
				`Chrome SHA-256 mismatch for ${version}/${platform}; refusing to extract`
			);
		runNode(chromeExtractCommand(), { directory, major, platform });
		const executablePath = runNode<string>(chromeEnvironmentCommand(), {
			directory,
			major,
			platform,
		});
		console.log(JSON.stringify({ version, executablePath }));
	} catch (error) {
		runNode(chromeDownloadCommand(), { remove: directory });
		throw error;
	}
};

if (import.meta.main) {
	try {
		installChrome(process.argv[2], process.argv[3]);
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
