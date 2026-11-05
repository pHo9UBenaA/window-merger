import { choice, object, strings, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { releaseVersion, validateReleaseVersion } from '../lib/version.ts';

const compareVersions = (left: string, right: string): number => {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);
	for (let index = 0; index < 3; index++) {
		const difference = leftParts[index] - rightParts[index];
		if (difference !== 0) return difference;
	}
	return 0;
};

export const inspectRelease = (input: unknown) => {
	const request = object(input);
	const action = choice(request.action, ['tags', 'marker', 'newer']);
	if (action === 'tags')
		return text(request.output)
			.split('\n')
			.filter(Boolean)
			.map((line) => line.split(/\s+/));
	if (action === 'marker') {
		const parents = text(request.parents).split(' ');
		return (
			parents.length === 2 &&
			parents[1] === text(request.base) &&
			request.candidateTree === request.baseTree &&
			request.subject === request.message
		);
	}
	const version = validateReleaseVersion(request.version);
	const prefix = text(request.prefix);
	const names = new Set(
		strings(request.refs).map((ref) => ref.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, ''))
	);
	for (const name of names) {
		const suffix = name.startsWith(prefix) ? name.slice(prefix.length) : '';
		const previous = /^\d+\.\d+\.\d+$/.test(suffix)
			? validateReleaseVersion(suffix)
			: releaseVersion(name);
		if (previous !== null && compareVersions(previous, version) >= 0)
			throw new Error(`Release ${version} is not newer than published version ${previous}`);
	}
	return null;
};
if (import.meta.main) await runJsonCli(inspectRelease);
