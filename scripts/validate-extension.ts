import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

type LocaleMessages = Record<string, { message: string }>;

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const MANIFEST_TEXT_LIMITS = [
	['name', 75],
	['description', 132],
	['short_name', 12],
] as const;

export const validateVersion = (version: unknown): string => {
	if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) {
		throw new Error('Invalid Chrome extension version');
	}
	const parts = version.split('.').map(Number);
	const isAllZero = parts.every((part) => part === 0);
	const hasOversizedComponent = parts.some((part) => part > 65535);
	if (isAllZero || hasOversizedComponent) {
		throw new Error('Chrome version components must be 0..65535 and not all zero');
	}
	return version;
};

const requireAssetFile = async (directory: string, assetName: unknown): Promise<string> => {
	if (typeof assetName !== 'string' || isAbsolute(assetName)) {
		throw new Error(`Invalid asset path: ${String(assetName)}`);
	}
	const directoryPrefix = `${resolve(directory)}${sep}`;
	const isInsideDirectory = resolve(directory, assetName).startsWith(directoryPrefix);
	if (!isInsideDirectory) throw new Error(`Invalid asset path: ${assetName}`);

	const assetPath = join(directory, assetName);
	if (!(await stat(assetPath)).isFile()) {
		throw new Error(`Missing asset: ${assetName}`);
	}
	return assetPath;
};

const validatePngIcon = async (
	directory: string,
	assetName: unknown,
	declaredSize?: string
): Promise<void> => {
	const assetPath = await requireAssetFile(directory, assetName);
	const data = await readFile(assetPath);
	const hasPngHeader =
		data.length >= 33 &&
		data.subarray(0, 8).equals(PNG_SIGNATURE) &&
		data.toString('ascii', 12, 16) === 'IHDR';
	if (!hasPngHeader) throw new Error(`Expected PNG icon: ${String(assetName)}`);

	const width = data.readUInt32BE(16);
	const height = data.readUInt32BE(20);
	const isNonemptySquare = width > 0 && width === height;
	const matchesDeclaredSize = declaredSize === undefined || width === Number(declaredSize);
	if (!isNonemptySquare || !matchesDeclaredSize) {
		throw new Error(
			`Icon dimensions do not match ${declaredSize ?? 'a square'}: ${String(assetName)}`
		);
	}
};

const validateIconSet = async (
	directory: string,
	icons: string | Record<string, unknown>
): Promise<void> => {
	if (typeof icons === 'string') {
		await validatePngIcon(directory, icons);
		return;
	}
	for (const [size, assetName] of Object.entries(icons)) {
		if (!/^[1-9]\d*$/.test(size)) throw new Error(`Invalid icon size: ${size}`);
		await validatePngIcon(directory, assetName, size);
	}
};

const validateLocalizedManifestFields = (
	manifest: Record<string, unknown>,
	messages: LocaleMessages,
	locale: string
): void => {
	for (const [key, maxCharacters] of MANIFEST_TEXT_LIMITS) {
		const template = manifest[key];
		if (key === 'short_name' && template === undefined) continue;
		if (typeof template !== 'string' || template.trim() === '') {
			throw new Error(`Missing manifest ${key}`);
		}
		const localizedText = template.replace(
			/__MSG_(\w+)__/g,
			(_, name) => messages[name].message
		);
		if (localizedText.trim() === '' || localizedText.length > maxCharacters) {
			throw new Error(
				`Localized manifest ${key} must be 1..${maxCharacters} characters in ${locale}`
			);
		}
	}
};

export const validateExtension = async (directory: string): Promise<void> => {
	const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
	validateVersion(manifest.version);
	if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
	const minimumChromeVersion = manifest.minimum_chrome_version;
	if (
		minimumChromeVersion !== undefined &&
		(typeof minimumChromeVersion !== 'string' ||
			!/^[1-9]\d*(\.\d+){0,3}$/.test(minimumChromeVersion))
	) {
		throw new Error('Invalid minimum Chrome version');
	}

	await requireAssetFile(directory, manifest.background?.service_worker);
	if (!manifest.icons?.['128']) throw new Error('Missing 128px Chrome Web Store icon');
	await validateIconSet(directory, manifest.icons);
	await validateIconSet(directory, manifest.action?.default_icon ?? {});

	const locales = await readdir(join(directory, '_locales'));
	if (!locales.includes(manifest.default_locale)) throw new Error('Default locale is missing');
	const manifestMessageKeys = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map(
		(match) => match[1]
	);
	const defaultMessages: LocaleMessages = JSON.parse(
		await readFile(
			join(directory, '_locales', manifest.default_locale, 'messages.json'),
			'utf8'
		)
	);
	const requiredMessageKeys = new Set([...Object.keys(defaultMessages), ...manifestMessageKeys]);
	for (const locale of locales) {
		const messages: LocaleMessages = {
			...defaultMessages,
			...JSON.parse(
				await readFile(join(directory, '_locales', locale, 'messages.json'), 'utf8')
			),
		};
		for (const key of requiredMessageKeys) {
			const message = messages[key]?.message;
			if (typeof message !== 'string' || message.trim() === '') {
				throw new Error(`Missing message ${key} in ${locale}`);
			}
		}
		validateLocalizedManifestFields(manifest, messages, locale);
	}
};
