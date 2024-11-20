const ContextMenuIdsKey = ['mergeWindow', 'mergeSecretWindow'] as const;

export const ContextMenuIds = {
	// TODO
	[ContextMenuIdsKey[0]]: ContextMenuIdsKey[0],
	[ContextMenuIdsKey[1]]: ContextMenuIdsKey[1],
} as const satisfies { [key in (typeof ContextMenuIdsKey)[number]]: key };

export type ContextMenuIds = keyof typeof ContextMenuIds;
