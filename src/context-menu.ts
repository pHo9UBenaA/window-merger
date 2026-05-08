export const ContextMenuIds = {
	mergeWindow: 'mergeWindowId',
	mergeIncognitoWindow: 'mergeIncognitoWindowId',
} as const;

export const ContextMenuTitles = {
	mergeWindow: 'mergeWindowTitle',
	mergeIncognitoWindow: 'mergeIncognitoWindowTitle',
} as const;

export type ContextMenuIds = (typeof ContextMenuIds)[keyof typeof ContextMenuIds];

export type ContextMenuTitles = (typeof ContextMenuTitles)[keyof typeof ContextMenuTitles];
