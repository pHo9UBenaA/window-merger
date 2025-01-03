import { sync as globSync } from 'glob';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		setupFiles: globSync('./__tests__/setup-files/*.ts'),
		include: ['./__tests__/**/*.{spec,test}.{ts,tsx}'],
		mockReset: true,
		clearMocks: true,
	},
});
