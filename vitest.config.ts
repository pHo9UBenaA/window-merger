import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['./test/unit/**/*.{spec,test}.{ts,tsx}'],
		mockReset: true,
		unstubGlobals: true,
		reporters: ['minimal'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			reporter: ['text-summary', 'lcov'],
		},
	},
});
