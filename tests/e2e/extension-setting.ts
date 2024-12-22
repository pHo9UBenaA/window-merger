import { By, Key, until, type WebElement } from 'selenium-webdriver';
import { driver } from './selenium-driver';

const sleepNumber = 500;

const extensionName = 'Window Merger';

/** chrome://extensionsに移動する */
const navigateToExtensionsPage = async (): Promise<void> => {
	await driver.get('chrome://extensions');

	await driver.sleep(sleepNumber);
};

/** 対象拡張機能の要素を探す */
const findExtensionElementByNameInExtensionsPage = async (
	extensionName: string
): Promise<WebElement> => {
	// 拡張機能の管理ページでは、shadow DOMが使用されているため、通常のBy.idなどでは要素を取得できない
	// そのため、shadowRootを取得し、その中から要素を取得する必要がある
	const manager = await driver.findElement(By.css('extensions-manager'));
	const managerShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		manager
	);
	const list = await managerShadowRoot.findElement(By.css('#items-list'));
	const listShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		list
	);

	// 拡張機能のアイテムを全て取得
	const extensionItems = await listShadowRoot.findElements(By.css('extensions-item'));

	// 各拡張機能のアイテムに対して、名前が一致するか確認
	for (const extensionItem of extensionItems) {
		const extensionItemShadowRoot = await driver.executeScript<WebElement>(
			'return arguments[0].shadowRoot',
			extensionItem
		);
		const nameElement = await extensionItemShadowRoot.findElement(By.css('#name'));
		const currentExtensionName = await nameElement.getText();

		// 拡張機能の名前が一致したら、そのアイテムを返す
		if (currentExtensionName === extensionName) {
			return extensionItem;
		}
	}

	throw new Error('拡張機能が見つかりませんでした');
};

/** 拡張機能の詳細ページに遷移する */
const navigateToExtensionDetailsPage = async (targetExtension: WebElement): Promise<void> => {
	// 拡張機能が見つかった場合、詳細ボタンをクリック
	const extensionItemShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		targetExtension
	);
	const detailsButton = await extensionItemShadowRoot.findElement(By.id('detailsButton'));
	await detailsButton.click();

	await driver.sleep(sleepNumber);
};

/** シークレットウィンドウでの実行を許可する要素を取得する */
const findEnableIncognitoModeElementInExtensionDetailsPage = async (): Promise<WebElement> => {
	// 詳細ページのShadowRootを取得
	const extensionsManager = await driver.findElement(By.css('extensions-manager'));
	const extensionsManagerShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		extensionsManager
	);
	const extensionsDetailView = await extensionsManagerShadowRoot.findElement(
		By.css('extensions-detail-view')
	);

	// 詳細ページのShadowRootを取得
	const extensionsDetailViewShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		extensionsDetailView
	);

	const allowIncognitoToggle = await extensionsDetailViewShadowRoot.findElement(
		By.id('allow-incognito')
	);
	const allowIncognitoToggleShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		allowIncognitoToggle
	);

	const toggleContainer = await allowIncognitoToggleShadowRoot.findElement(By.id('crToggle'));

	return toggleContainer;
};

export const allowIncognito = async () => {
	await navigateToExtensionsPage();

	const targetExtensionElement = await findExtensionElementByNameInExtensionsPage(extensionName);

	await navigateToExtensionDetailsPage(targetExtensionElement);

	const toggleContainer = await findEnableIncognitoModeElementInExtensionDetailsPage();

	toggleContainer.click();

	await driver.sleep(sleepNumber);
};

//////////////////////////////////////////////////////////

/** chrome://extensions/shortcutsに移動する */
const navigateToExtensionsShortcutsPage = async (): Promise<void> => {
	await driver.get('chrome://extensions/shortcuts');

	await driver.sleep(sleepNumber);
};

const getExtensionsManagerShadowRoot = async (): Promise<WebElement> => {
	// extensions-manager が表示されるまで待機する
	await driver.wait(until.elementLocated(By.css('extensions-manager')), sleepNumber);

	const extensionsManager = await driver.findElement(By.css('extensions-manager'));
	const extensionsManagerShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		extensionsManager
	);
	return extensionsManagerShadowRoot;
};

/** cr-view-managerのShadowRootを取得する */
const getCrViewManagerShadowRoot = async (
	extensionsManagerShadowRoot: WebElement
): Promise<WebElement> => {
	const crViewManager = await extensionsManagerShadowRoot.findElement(By.css('cr-view-manager'));
	return crViewManager;
};

/** extensions-keyboard-shortcutsのShadowRootを取得する */
const getExtensionsKeyboardShortcutsShadowRoot = async (
	extensionsManagerShadowRoot: WebElement
): Promise<WebElement> => {
	const extensionsKeyboardShortcuts = await extensionsManagerShadowRoot.findElement(
		By.css('extensions-keyboard-shortcuts')
	);
	const extensionsKeyboardShortcutsShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		extensionsKeyboardShortcuts
	);
	return extensionsKeyboardShortcutsShadowRoot;
};

/** #containerのShadowRootを取得する */
const getContainerShadowRoot = async (
	extensionsKeyboardShortcutsShadowRoot: WebElement
): Promise<WebElement> => {
	const container = await extensionsKeyboardShortcutsShadowRoot.findElement(By.css('#container'));
	return container;
};

/** 一つ目の.shortcut-cardを取得する */
const getFirstShortcutCard = async (containerShadowRoot: WebElement): Promise<WebElement> => {
	const shortcutCard = await containerShadowRoot.findElement(By.css('.shortcut-card'));
	return shortcutCard;
};

/** 一つ目の.command-entryを取得する */
const getFirstCommandEntry = async (shortcutCard: WebElement): Promise<WebElement> => {
	const commandEntry = await shortcutCard.findElement(By.css('.command-entry'));
	return commandEntry;
};

/** 一つ目のextensions-shortcut-inputのShadowRootを取得する */
const getFirstShortcutInputShadowRoot = async (commandEntry: WebElement): Promise<WebElement> => {
	const shortcutInput = await commandEntry.findElement(By.css('extensions-shortcut-input'));
	const shortcutInputShadowRoot = await driver.executeScript<WebElement>(
		'return arguments[0].shadowRoot',
		shortcutInput
	);
	return shortcutInputShadowRoot;
};

/** 一つ目のcr-icon-buttonを取得する */
const getFirstEditButton = async (shortcutInputShadowRoot: WebElement): Promise<WebElement> => {
	const editButton = await shortcutInputShadowRoot.findElement(By.css('#edit'));
	return editButton;
};

/** 一つ目のcr-icon-buttonを押下する */
const clickFirstEditButton = async (editButton: WebElement): Promise<void> => {
	await editButton.click();
};

/** ショートカットキーを設定する */
export const mergeWindowShortCut = async (): Promise<void> => {
	await driver.actions().keyDown(Key.CONTROL).sendKeys('m').perform();
};

export const setShortcutKey = async () => {
	await navigateToExtensionsShortcutsPage();

	const extensionsManagerShadowRoot = await getExtensionsManagerShadowRoot();
	const crViewManagerShadowRoot = await getCrViewManagerShadowRoot(extensionsManagerShadowRoot);
	const extensionsKeyboardShortcutsShadowRoot =
		await getExtensionsKeyboardShortcutsShadowRoot(crViewManagerShadowRoot);
	const containerShadowRoot = await getContainerShadowRoot(extensionsKeyboardShortcutsShadowRoot);
	const shortcutCard = await getFirstShortcutCard(containerShadowRoot);
	const commandEntry = await getFirstCommandEntry(shortcutCard);
	const shortcutInputShadowRoot = await getFirstShortcutInputShadowRoot(commandEntry);
	const editButton = await getFirstEditButton(shortcutInputShadowRoot);
	await clickFirstEditButton(editButton);
	await mergeWindowShortCut();

	await driver.sleep(sleepNumber);
};
