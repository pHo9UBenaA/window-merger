import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
	// Look for test files in the "tests" directory, relative to this configuration file.
	testDir: path.join(__dirname, './tests/e2e/specs'),

	// Run all tests in parallel.
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code.
	forbidOnly: !!process.env.CI,

	// Retry on CI only.
	retries: process.env.CI ? 2 : 0,

	// Opt out of parallel tests on CI.
	workers: process.env.CI ? 1 : undefined,

	// Reporter to use
	reporter: 'list',

	use: {
		// Base URL to use in actions like `await page.goto('/')`.
		baseURL: 'http://127.0.0.1:3000',

		// Collect trace when retrying the failed test.
		trace: 'on-first-retry',
	},
	// Configure projects for major browsers.
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
