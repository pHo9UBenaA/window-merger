import { Builder } from 'selenium-webdriver';
import * as chromeDriver from 'selenium-webdriver/chrome';

const options = new chromeDriver.Options();
options.addArguments('--load-extension=/Users/RH/Documents/git/window-merger-extension/dist');

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

export { driver };
