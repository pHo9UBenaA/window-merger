import { object, text } from '../lib/input.ts';
import { runJsonCli } from '../lib/json-cli.ts';
import { validateReleaseVersion, validateVersion } from '../lib/version.ts';

export const validateVersions = (input: unknown): string => {
	const request = object(input);
	const pkg = object(JSON.parse(text(request.packageJson)));
	const manifest = object(JSON.parse(text(request.manifestJson)));
	const version = validateReleaseVersion(pkg.version);
	if (validateVersion(manifest.version) !== version)
		throw new Error(
			`Package version ${version} does not match manifest version ${String(manifest.version)}`
		);
	return version;
};
if (import.meta.main) await runJsonCli(validateVersions);
