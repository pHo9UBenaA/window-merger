import { installChrome } from '../lib/chrome-compat.ts';

try {
	await installChrome(process.argv[2], process.argv[3]);
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
