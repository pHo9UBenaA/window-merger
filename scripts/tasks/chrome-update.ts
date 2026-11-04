import { updateLock } from '../lib/chrome-compat.ts';

try {
	await updateLock();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
