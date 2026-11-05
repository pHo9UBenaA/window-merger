import { watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { runNode } from '../lib/run-node.ts';
import { bundleCommand, prepareAssetsCommand, writeAssetsCommand } from './commands.generated.ts';

type BuildOptions = { readonly root?: string; readonly minify?: boolean };
type AssetPlan = { readonly names?: readonly string[]; readonly major: string };
const synchronize = (root: string, minify: boolean, previous?: readonly string[]): AssetPlan => {
	const plan = runNode<AssetPlan>(
		prepareAssetsCommand(root),
		previous === undefined ? {} : { previous },
		root
	);
	runNode(writeAssetsCommand(root), plan, root);
	runNode(bundleCommand(root), { major: plan.major, minify }, root);
	return plan;
};

export const buildExtension = ({
	root: directory = process.cwd(),
	minify = true,
}: BuildOptions): void => {
	const root = resolve(directory);
	runNode(writeAssetsCommand(root), { action: 'reset' }, root);
	synchronize(root, minify);
};

const watchExtension = (minify: boolean): (() => Promise<void>) => {
	const root = process.cwd();
	runNode(writeAssetsCommand(root), { action: 'reset' }, root);
	let previous: readonly string[] = [];
	let pending = Promise.resolve();
	const rebuild = () => {
		previous = synchronize(root, minify, previous).names ?? [];
	};
	const watcher = watch(join(root, 'src'), { recursive: true }, () => {
		pending = pending.then(rebuild).catch(console.error);
	});
	watcher.on('error', console.error);
	try {
		rebuild();
	} catch (error) {
		watcher.close();
		throw error;
	}
	return async () => {
		watcher.close();
		await pending;
	};
};

if (import.meta.main) {
	try {
		const minify = !process.argv.includes('--no-minify');
		if (process.argv.includes('--watch')) {
			const dispose = watchExtension(minify);
			const stop = () => {
				void dispose().catch(console.error);
			};
			process.once('SIGINT', stop);
			process.once('SIGTERM', stop);
			console.log('Watching source and assets. Reload the extension after changes.');
		} else buildExtension({ minify });
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
