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
const errors: string[] = [];
const originalError = console.error.bind(console);
console.error = (...values: unknown[]) => {
	errors.push(values.map(String).join(' '));
	originalError(...values);
};

declare global {
	var mergerTest: {
		action: () => void;
		menu: (id: string) => void;
		errors: string[];
	};
}
globalThis.mergerTest = {
	action: () => {
		for (const listener of actionListeners) listener({} as chrome.tabs.Tab);
	},
	menu: (menuItemId) => {
		for (const listener of menuListeners) listener({ menuItemId, editable: false });
	},
	errors,
};

export {};
