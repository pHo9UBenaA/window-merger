import { pnpmReport } from './pnpm-report.ts';

export const collectReports = () => ({
	audit: pnpmReport('audit'),
	list: pnpmReport('list'),
});

if (import.meta.main) {
	try {
		console.log(JSON.stringify(collectReports()));
	} catch (error) {
		console.error(error);
		process.exitCode = 2;
	}
}
