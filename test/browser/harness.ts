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
const createdMenus: { id: string | number; enabled: boolean | undefined }[] = [];
const createMenu = chrome.contextMenus.create.bind(chrome.contextMenus);
// Record only successful production IO, while lastError is valid in its callback.
chrome.contextMenus.create = (properties, done) =>
	createMenu(properties, () => {
		if (!chrome.runtime.lastError) {
			createdMenus.push({ id: properties.id ?? '', enabled: properties.enabled });
		}
		done?.();
	});

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
		createdMenus: typeof createdMenus;
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
	createdMenus,
};

export {};
