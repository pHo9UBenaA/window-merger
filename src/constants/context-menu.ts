const contextMenuKeys = [
	'mergeWindow',
	'mergeIncognitoWindow',
] as const satisfies readonly string[];

export const ContextMenuIds = {
	// TODO
	[contextMenuKeys[0]]: `${contextMenuKeys[0]}Id`,
	[contextMenuKeys[1]]: `${contextMenuKeys[1]}Id`,
} as const satisfies { [key in (typeof contextMenuKeys)[number]]: `${key}Id` };

export const ContextMenuTitles = {
	[contextMenuKeys[0]]: `${contextMenuKeys[0]}Title`,
	[contextMenuKeys[1]]: `${contextMenuKeys[1]}Title`,
} as const satisfies { [key in (typeof contextMenuKeys)[number]]: `${key}Title` };

export type ContextMenuIds = (typeof ContextMenuIds)[keyof typeof ContextMenuIds];

export type ContextMenuTitles = (typeof ContextMenuTitles)[keyof typeof ContextMenuTitles];
