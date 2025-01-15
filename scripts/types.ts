const extensionIdBrand = Symbol();

export type ExtensionId = string & { [extensionIdBrand]: unknown };
