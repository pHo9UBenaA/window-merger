import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, launchOptions) => {
        // supply the absolute path to an unpacked extension's folder
        // NOTE: extensions cannot be loaded in headless Chrome
        // launchOptions.args.push(' --incognito')
        launchOptions.extensions.push('./dist')
        return launchOptions
      })
    },
  },
});
