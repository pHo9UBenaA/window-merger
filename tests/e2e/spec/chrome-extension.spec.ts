import { Key } from 'selenium-webdriver';
import { driver } from '../selenium-driver';
import { afterAll, beforeAll, describe, it } from 'bun:test';
import { allowIncognito, setShortcutKey } from '../extension-setting';

describe('Chrome Extension Tests', () => {
	beforeAll(async () => {
		await allowIncognito();
		await setShortcutKey();
	});

	afterAll(async () => {
		// await driver.quit();
	});

	it('', async () => {
		// 新しいウィンドウを開く
		await driver.switchTo().newWindow('window');
		await driver.get('https://www.google.com');
		await driver.sleep(100);

		// もう一つ新しいウィンドウを開く
		await driver.switchTo().newWindow('window');
		await driver.get('https://www.google.com');
		await driver.sleep(100);

		// ショートカットキーの実行を試してみる
		await driver.actions().clear();
		// sendKeysだけでやってみたり、Key.ALTとかに変更してみたもののうまくいかなかった
		// webdriver側の問題か？（リンク忘れたけどStackoverflowでこれ以外のCTRL+N以外のショートカットキーは動作するみたいな話を見た気がするので関係ないかも
		// → https://github.com/rshf/chromedriver/issues/581
		// selemiumのissueやstackoverflowを漁ってみたけど現在議論中のものは見つからずCloseしているものばかりだったし、いくつか目についた回避策らしきもの試してみても特に変わらず
		await driver.actions().keyDown(Key.CONTROL).sendKeys('m').perform();

		// // コンテキストメニューを試してみる
		// const body = await driver.findElement(By.css('body'));
		// await driver.actions().contextClick(body).perform();
		// await driver.sleep(1000);
		// await driver.actions().sendKeys(Key.PAGE_DOWN).perform();

		// 仮にマージできてもウィンドウの数を取得する方法がchrome.window.getAllしかないため、目視確認しなくちゃいけないかも
		// chrome.window.getAllの値はもしかしたらプロセス間通信でどうにかできるかも
	});
});
