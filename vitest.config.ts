import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Get all TypeScript files directly under the given directory
 */
const getSetupFiles = (dir: string): string[] => {
	const entries = readdirSync(dir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
		.map((entry) => join(dir, entry.name));
};

export default defineConfig({
	test: {
		setupFiles: getSetupFiles('./__tests__/setup-files'),
		include: ['./__tests__/**/*.{spec,test}.{ts,tsx}'],
		mockReset: true,
		clearMocks: true,
	},
});
