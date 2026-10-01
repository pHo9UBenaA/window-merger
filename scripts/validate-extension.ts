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
	if (manifest.manifest_version !== 3) {
		throw new Error('Expected Manifest V3');
	}
	if (
		manifest.minimum_chrome_version !== undefined &&
		(typeof manifest.minimum_chrome_version !== 'string' ||
			!/^[1-9]\d*(\.\d+){0,3}$/.test(manifest.minimum_chrome_version))
	) {
		throw new Error('Invalid minimum Chrome version');
	}
	const requireFile = async (name: unknown) => {
		if (
			typeof name !== 'string' ||
			isAbsolute(name) ||
			!resolve(directory, name).startsWith(`${resolve(directory)}${sep}`)
		) {
			throw new Error(`Invalid asset path: ${String(name)}`);
		}
		const path = join(directory, name);
		if (!(await stat(path)).isFile()) {
			throw new Error(`Missing asset: ${name}`);
		}
		return path;
	};
	const requireIcon = async (name: unknown, size?: string) => {
		const data = await readFile(await requireFile(name));
		if (
			data.length < 33 ||
			!data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
			data.toString('ascii', 12, 16) !== 'IHDR'
		) {
			throw new Error(`Expected PNG icon: ${String(name)}`);
		}
		const width = data.readUInt32BE(16);
		const height = data.readUInt32BE(20);
		if (width === 0 || width !== height || (size !== undefined && width !== Number(size))) {
			throw new Error(`Icon dimensions do not match ${size ?? 'a square'}: ${String(name)}`);
		}
	};
	await requireFile(manifest.background?.service_worker);
	if (!manifest.icons?.['128']) {
		throw new Error('Missing 128px Chrome Web Store icon');
	}
	for (const icons of [manifest.icons, manifest.action?.default_icon ?? {}]) {
		if (typeof icons === 'string') {
			await requireIcon(icons);
			continue;
		}
		for (const [size, name] of Object.entries(icons)) {
			if (!/^[1-9]\d*$/.test(size)) throw new Error(`Invalid icon size: ${size}`);
			await requireIcon(name, size);
		}
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
		const messages = {
			...defaultMessages,
			...JSON.parse(
				await readFile(join(directory, '_locales', locale, 'messages.json'), 'utf8')
			),
		};
		for (const key of new Set([...Object.keys(defaultMessages), ...references])) {
			if (typeof messages[key]?.message !== 'string' || messages[key].message.trim() === '') {
				throw new Error(`Missing message ${key} in ${locale}`);
			}
		}
		for (const [key, maximum] of [
			['name', 75],
			['description', 132],
			['short_name', 12],
		] as const) {
			const template = manifest[key];
			if (key === 'short_name' && template === undefined) continue;
			if (typeof template !== 'string' || template.trim() === '') {
				throw new Error(`Missing manifest ${key}`);
			}
			const text = template.replace(/__MSG_(\w+)__/g, (_, name) => messages[name].message);
			if (text.trim() === '' || text.length > maximum) {
				throw new Error(
					`Localized manifest ${key} must be 1..${maximum} characters in ${locale}`
				);
			}
		}
	}
};
