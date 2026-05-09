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
		setupFiles: getSetupFiles('./test/setup'),
		include: ['./test/**/*.{spec,test}.{ts,tsx}'],
		mockReset: true,
		clearMocks: true,
		reporters: ['minimal'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			reporter: ['text-summary', 'lcov'],
			thresholds: {
				branches: 90,
			},
		},
	},
});
