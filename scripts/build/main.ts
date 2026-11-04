import { watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { runNode } from '../lib/run-node.ts';
import { bundleCommand, prepareAssetsCommand, writeAssetsCommand } from './commands.generated.ts';

type BuildOptions = { readonly root?: string; readonly minify?: boolean };
type AssetPlan = { readonly names: string[]; readonly major: string };
const synchronize = async (
	root: string,
	minify: boolean,
	previous: readonly string[] = [],
	watching = false
): Promise<string[]> => {
	const plan = await runNode<AssetPlan>(prepareAssetsCommand(root), { previous, watching }, root);
	await runNode(writeAssetsCommand(root), plan, root);
	await runNode(bundleCommand(root), { major: plan.major, minify }, root);
	return plan.names;
};

export const buildExtension = async ({
	root: directory = process.cwd(),
	minify = true,
}: BuildOptions = {}): Promise<void> => {
	const root = resolve(directory);
	await runNode(writeAssetsCommand(root), { action: 'reset' }, root);
	await synchronize(root, minify);
};

export const watchExtension = async (
	{ root: directory = process.cwd(), minify = true }: BuildOptions = {},
	onError: (error: unknown) => void = console.error
): Promise<() => Promise<void>> => {
	const root = resolve(directory);
	await runNode(writeAssetsCommand(root), { action: 'reset' }, root);
	let previous: string[] = [];
	let pending = Promise.resolve();
	const rebuild = async () => {
		previous = await synchronize(root, minify, previous, true);
	};
	const watcher = watch(join(root, 'src'), { recursive: true }, () => {
		pending = pending.then(rebuild).catch(onError);
	});
	watcher.on('error', onError);
	try {
		await rebuild();
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
			const dispose = await watchExtension({ minify });
			const stop = () => {
				void dispose().catch(console.error);
			};
			process.once('SIGINT', stop);
			process.once('SIGTERM', stop);
			console.log('Watching source and assets. Reload the extension after changes.');
		} else await buildExtension({ minify });
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
