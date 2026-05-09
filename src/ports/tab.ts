import type { MoveToWindow, TabId, TabUpdate } from '../domain/window-merge.types';

export type TabPort = {
	readonly updateTab: (tabId: TabId, properties: TabUpdate) => Promise<void>;
	readonly moveTabs: (tabIds: readonly TabId[], moveProperties: MoveToWindow) => Promise<void>;
};
