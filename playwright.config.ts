import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './test/browser',
	testMatch: '**/*.spec.ts',
	workers: 1,
	fullyParallel: false,
	timeout: 60000,
	expect: { timeout: 15000 },
	reporter: [
		[process.env.CI ? 'github' : 'list'],
		['json', { outputFile: 'test-results/results.json' }],
	],
	outputDir: 'test-results',
	projects: [
		{ name: 'chromium', grepInvert: /@stress/ },
		{ name: 'stress', grep: /@stress/, timeout: 180000 },
		{ name: 'compat', grep: /@compat/ },
	],
});
