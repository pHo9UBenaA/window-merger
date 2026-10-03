// Test-only event bridge. The production artifact is copied unchanged after this prelude.
// Real Chrome API methods still run; no bridge is shipped in dist/ or dist.zip.
const actionListeners: Parameters<typeof chrome.action.onClicked.addListener>[0][] = [];
const menuListeners: Parameters<typeof chrome.contextMenus.onClicked.addListener>[0][] = [];
const addActionListener = chrome.action.onClicked.addListener.bind(chrome.action.onClicked);
const addMenuListener = chrome.contextMenus.onClicked.addListener.bind(
	chrome.contextMenus.onClicked
);
chrome.action.onClicked.addListener = (listener) => {
	actionListeners.push(listener);
	addActionListener(listener);
};
chrome.contextMenus.onClicked.addListener = (listener) => {
	menuListeners.push(listener);
	addMenuListener(listener);
};
type MenuOperation = {
	operation: 'create' | 'update';
	id: string | number;
	enabled: boolean | undefined;
};
const menuOperations: MenuOperation[] = [];
const createMenu = chrome.contextMenus.create.bind(chrome.contextMenus);
const updateMenu = chrome.contextMenus.update.bind(chrome.contextMenus);
// Record only successful production IO, while lastError is valid in its callback.
const completedMenu = (operation: MenuOperation, done?: () => void) => () => {
	if (!chrome.runtime.lastError) menuOperations.push(operation);
	done?.();
};
chrome.contextMenus.create = (properties, done) =>
	createMenu(
		properties,
		completedMenu(
			{ operation: 'create', id: properties.id ?? '', enabled: properties.enabled },
			done
		)
	);
function observeMenuUpdate(
	id: string | number,
	properties: Omit<chrome.contextMenus.CreateProperties, 'id'>
): Promise<void>;
function observeMenuUpdate(
	id: string | number,
	properties: Omit<chrome.contextMenus.CreateProperties, 'id'>,
	done: () => void
): void;
function observeMenuUpdate(
	id: string | number,
	properties: Omit<chrome.contextMenus.CreateProperties, 'id'>,
	done?: () => void
): Promise<void> | void {
	if (!done) return updateMenu(id, properties);
	return updateMenu(
		id,
		properties,
		completedMenu({ operation: 'update', id, enabled: properties.enabled }, done)
	);
}
chrome.contextMenus.update = observeMenuUpdate;

const errors: string[] = [];
const originalError = console.error.bind(console);
console.error = (...values: unknown[]) => {
	errors.push(values.map(String).join(' '));
	originalError(...values);
};

declare global {
	var mergerTest: {
		action: () => Promise<void>;
		menu: (id: string) => void;
		errors: string[];
		menuOperations: MenuOperation[];
	};
}
globalThis.mergerTest = {
	action: async () => {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab) throw new Error('Missing active tab for action event');
		for (const listener of actionListeners) listener(tab);
	},
	menu: (menuItemId) => {
		for (const listener of menuListeners) listener({ menuItemId, editable: false });
	},
	errors,
	menuOperations,
};

export {};
