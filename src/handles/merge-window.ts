const targetWindowType = 'normal' satisfies chrome.windows.windowTypeEnum;

const test: any = '';

/**
 * ウィンドウが指定された型 (通常ウィンドウまたはシークレットウィンドウ) であるかどうかを判定します。
 * この関数は型ガードとして機能し、型の安全性を確保します。
 * @template T - ウィンドウがシークレット (incognito) モードかどうかを示すブール型
 * @param window - 判定対象のウィンドウオブジェクト
 * @param param1 - 判定条件としてのプロパティオブジェクト
 *   @property incognito - ウィンドウがシークレットモードかどうかを示すフラグ
 * @returns `true` の場合、ウィンドウは指定された `incognito` フラグと型 (`targetWindowType`) に一致する
 */
const isWindowType = <T extends boolean>(
	window: chrome.windows.Window,
	{ incognito }: { incognito: T }
): window is chrome.windows.Window & {
	incognito: T;
	type: typeof targetWindowType;
} => {
	return window.incognito === incognito && window.type === targetWindowType;
};

/**
 * 指定されたタブをターゲットウィンドウに移動する
 * グループ化されたタブはグループごとに移動し、グループ化されていないタブは個別に移動する
 * @param tabs - 移動対象のタブリスト
 * @param targetWindowId - 移動先のウィンドウID
 */
const moveTabsToTargetWindow = async (
	tabs: chrome.tabs.Tab[],
	targetWindowId: number
): Promise<void> => {
	const moveProperties: chrome.tabGroups.MoveProperties & chrome.tabs.MoveProperties = {
		windowId: targetWindowId,
		index: -1,
	};

	const groupedTabs = tabs.filter((tab) => tab.groupId > 0);

	const groupIds = [...new Set(groupedTabs.map((tab) => tab.groupId))];
	if (groupIds.length > 0) {
		await Promise.all(
			groupIds.map((groupId) => chrome.tabGroups.move(groupId, moveProperties))
		);
	}

	const groupedTabIdSet = new Set(groupedTabs.map((tab) => tab.id));
	const ungroupedTabIds = tabs
		.filter((tab) => !groupedTabIdSet.has(tab.id))
		.map((tab) => tab.id)
		.filter((tabId): tabId is number => tabId !== undefined);
	if (ungroupedTabIds.length > 0) {
		await chrome.tabs.move(ungroupedTabIds, moveProperties);
	}
};

/**
 * 移動したタブのピン留め処理を行う
 * chrome.tabGroups.moveやchrome.tabs.moveではピンの状態が保持されず、保持するオプションなども存在しないため
 * @param tabs - ピン留めの状態を復元する対象となるタブリスト
 */
const repinTabs = async (tabs: chrome.tabs.Tab[]): Promise<void> => {
	const pinnedTabs = tabs.filter((tab) => tab.pinned && tab.id !== undefined);

	await Promise.all(
		pinnedTabs.map((tab) =>
			tab.id ? chrome.tabs.update(tab.id, { pinned: true }) : Promise.resolve()
		)
	);
};

const mergeWindow = async (windows: chrome.windows.Window[]) => {
	if (windows.length <= 1) {
		return;
	}

	const [firstWindow, ...restWindows] = windows;
	if (!firstWindow.id) {
		throw new Error('The first window is undefined or null.');
	}

	for (const window of restWindows) {
		const { tabs } = window;
		if (!tabs) {
			const serializedWindow = JSON.stringify(window);
			throw new Error(
				`Window with id ${window.id} does not have any tabs: ${serializedWindow}`
			);
		}

		await moveTabsToTargetWindow(tabs, firstWindow.id);
		await repinTabs(tabs);
		for (const tab of tabs) {
			if (tab.id === undefined) {
				console.info('Undefined tab id:', tab);
			}
		}
	}
};

const handleMergeWindowEvent = async () => {
	try {
		const windows = await chrome.windows.getAll({ populate: true });
		const normalWindows = windows
			.map((window) => (isWindowType(window, { incognito: false }) ? window : undefined))
			.filter((window) => window !== undefined);
		await mergeWindow(normalWindows);
	} catch (error) {
		console.error('Failed to process:', error);
	}
};

const handleMergeIncognitoWindowEvent = async () => {
	try {
		const windows = await chrome.windows.getAll({ populate: true });
		const incognitoWindows = windows
			.map((window) => (isWindowType(window, { incognito: true }) ? window : undefined))
			.filter((window) => window !== undefined);
		await mergeWindow(incognitoWindows);
	} catch (error) {
		console.error('Failed to process:', error);
	}
};

export { handleMergeIncognitoWindowEvent, handleMergeWindowEvent };
