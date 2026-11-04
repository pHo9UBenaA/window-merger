import type { ChromeUpdatePlan } from '../lib/chrome-compat.ts';
import { chromeDownloadCommand } from '../lib/commands.generated.ts';
import { runNode } from '../lib/run-node.ts';
import { readChromeUpdateCommand, writeChromeLockCommand } from './commands.generated.ts';

export const updateLock = async (): Promise<void> => {
	const { versions, checksums, downloads } = await runNode<ChromeUpdatePlan>(
		readChromeUpdateCommand()
	);
	for (const { version, platform } of downloads) {
		const { sha256 } = await runNode<{ sha256: string }>(chromeDownloadCommand(), {
			purpose: 'hash',
			version,
			platform,
		});
		checksums[version] = { ...checksums[version], [platform]: sha256 };
	}
	await runNode(writeChromeLockCommand(), { checksums, versions });
};

if (import.meta.main) {
	try {
		await updateLock();
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
