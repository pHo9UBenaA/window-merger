import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

export const validateVersion = (version: unknown): string => {
	if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) {
		throw new Error('Invalid Chrome extension version');
	}
	const parts = version.split('.').map(Number);
	if (parts.every((part) => part === 0) || parts.some((part) => part > 65535)) {
		throw new Error('Chrome version components must be 0..65535 and not all zero');
	}
	return version;
};

export const validateExtension = async (directory: string): Promise<void> => {
	const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
	validateVersion(manifest.version);
	if (manifest.manifest_version !== 3 || manifest.minimum_chrome_version !== '120') {
		throw new Error('Expected Manifest V3 targeting Chrome 120 or later');
	}
	const requireFile = async (name: unknown) => {
		if (
			typeof name !== 'string' ||
			isAbsolute(name) ||
			!resolve(directory, name).startsWith(`${resolve(directory)}${sep}`)
		) {
			throw new Error(`Invalid asset path: ${String(name)}`);
		}
		if (!(await stat(join(directory, name))).isFile()) {
			throw new Error(`Missing asset: ${name}`);
		}
	};
	await requireFile(manifest.background?.service_worker);
	for (const name of [
		...Object.values(manifest.icons ?? {}),
		...Object.values(manifest.action?.default_icon ?? {}),
	]) {
		await requireFile(name);
	}
	const locales = await readdir(join(directory, '_locales'));
	if (!locales.includes(manifest.default_locale)) {
		throw new Error('Default locale is missing');
	}
	const references = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map(
		(match) => match[1]
	);
	const defaultMessages = JSON.parse(
		await readFile(
			join(directory, '_locales', manifest.default_locale, 'messages.json'),
			'utf8'
		)
	);
	for (const locale of locales) {
		const messages = JSON.parse(
			await readFile(join(directory, '_locales', locale, 'messages.json'), 'utf8')
		);
		for (const key of new Set([...Object.keys(defaultMessages), ...references])) {
			if (typeof messages[key]?.message !== 'string' || messages[key].message.trim() === '') {
				throw new Error(`Missing message ${key} in ${locale}`);
			}
		}
		if (
			messages.extensionName.message.length > 75 ||
			messages.extensionDescription.message.length > 132
		) {
			throw new Error(`Localized manifest text is too long in ${locale}`);
		}
	}
};
