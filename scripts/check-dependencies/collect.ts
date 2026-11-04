import { operate as pnpmReport } from './pnpm-report.ts';

export const collectReports = () => ({
	audit: pnpmReport({ kind: 'audit' }),
	list: pnpmReport({ kind: 'list' }),
});

if (import.meta.main) {
	try {
		console.log(JSON.stringify(collectReports()));
	} catch (error) {
		console.error(error);
		process.exitCode = 2;
	}
}
