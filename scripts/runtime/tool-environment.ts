export const toolEnvironment = (flags: readonly string[]): NodeJS.ProcessEnv => ({
	...process.env,
	// CLI shims would otherwise inherit the operation's module-only read grants.
	NODE_OPTIONS: ['--permission', ...flags]
		.map((flag) => (/\s/.test(flag) ? JSON.stringify(flag) : flag))
		.join(' '),
});
