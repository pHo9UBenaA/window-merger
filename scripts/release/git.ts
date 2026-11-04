import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { choice, object, strings, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { checkedRef, releaseCheckout } from '../lib/script-paths.ts';

const isolatedEnvironment = () =>
	Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));

export const operate = (input: unknown): string => {
	const request = object(input);
	const checkout = releaseCheckout(request.cwd);
	const args = strings(request.args);
	const [command, ...rest] = args;
	const git = (args: readonly string[], cwd: string, isolated = true) =>
		execFileSync('git', args, {
			cwd,
			env: isolated ? isolatedEnvironment() : process.env,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	if (command === 'clone' && rest.length === 0)
		return git(
			['clone', '--no-local', '--no-checkout', '--no-tags', '--', process.cwd(), checkout],
			process.cwd()
		);
	if (command === 'checkout' && rest.length === 2 && rest[0] === '--detach') {
		checkedRef(rest[1]);
	} else if (command === 'remote' && rest.join(' ') === 'set-url origin') {
		const remote = git(['remote', 'get-url', '--push', 'origin'], process.cwd(), false);
		const destination =
			isAbsolute(remote) || remote.includes(':') ? remote : resolve(process.cwd(), remote);
		return git(['remote', 'set-url', 'origin', destination], checkout);
	} else if (command === 'config' && rest.length === 1) {
		const field = choice(rest[0], ['user.name', 'user.email']);
		return git(['config', field, git(['config', field], process.cwd(), false)], checkout);
	} else if (command === 'config' && rest.length === 2 && rest[1] === 'false') {
		choice(rest[0], ['commit.gpgSign', 'tag.gpgSign']);
	} else if (command === 'check-ref-format' && rest.length === 1) {
		checkedRef(rest[0]);
	} else if (
		command === 'fetch' &&
		rest.length === 3 &&
		rest.slice(0, 2).join(' ') === '--no-tags origin'
	) {
		if (!text(rest[2]).startsWith('refs/tags/'))
			throw new Error('Only release tags may be fetched');
		checkedRef(rest[2]);
	} else if (command === 'push' && rest.length === 2 && rest[0] === 'origin') {
		if (!text(rest[1]).startsWith('refs/tags/') || rest[1].includes(':'))
			throw new Error('Only a single tag may be published');
		checkedRef(rest[1]);
	} else throw new Error('Unsupported release Git operation');
	return git(args, checkout);
};

if (import.meta.main) await runJsonCli(operate);
