export const validateVersion = (version: unknown): string => {
	if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version))
		throw new Error('Invalid Chrome extension version');
	const parts = version.split('.').map(Number);
	if (parts.every((part) => part === 0) || parts.some((part) => part > 65535))
		throw new Error('Chrome version components must be 0..65535 and not all zero');
	return version;
};

export const releaseVersion = (ref: string): string | null => {
	const refName = ref.replace(/^refs\/(heads|tags)\//, '');
	const match = /^(?:release\/)?v(\d+\.\d+\.\d+)$/.exec(refName);
	return match ? validateVersion(match[1]) : null;
};

export const validateReleaseVersion = (version: unknown): string => {
	const valid = validateVersion(version);
	if (!/^\d+\.\d+\.\d+$/.test(valid))
		throw new Error('Release versions must have three numeric components');
	return valid;
};
