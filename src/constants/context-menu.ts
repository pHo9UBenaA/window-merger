const contextMenuIdKeys = [
	'mergeWindow',
	'mergeIncognitoWindow',
] as const satisfies readonly string[];

export const ContextMenuIds = {
	// TODO
	[contextMenuIdKeys[0]]: contextMenuIdKeys[0],
	[contextMenuIdKeys[1]]: contextMenuIdKeys[1],
} as const satisfies { [key in (typeof contextMenuIdKeys)[number]]: key };

export const ContextMenuTitles = {
	[contextMenuIdKeys[0]]: `${contextMenuIdKeys[0]}Title`,
	[contextMenuIdKeys[1]]: `${contextMenuIdKeys[1]}Title`,
} as const satisfies { [key in (typeof contextMenuIdKeys)[number]]: `${key}Title` };

export const isContextMenuId = (id: string): id is ContextMenuIds =>
	contextMenuIdKeys.includes(id as ContextMenuIds);

export const isContextMenuTitle = (title: string): title is ContextMenuTitles =>
	Object.values(ContextMenuTitles).includes(title as ContextMenuTitles);

export type ContextMenuIds = keyof typeof ContextMenuIds;

export type ContextMenuTitles = typeof ContextMenuTitles[keyof typeof ContextMenuTitles];
