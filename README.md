# Window Merger

A Chrome extension that merges all your browser windows into one — keeping
pinned tabs, tab groups, and mute states intact.

## Installation

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/merge-window-extension/fijodggmkbkjcmlpkpahjpepngppdppb).

## Usage

Click the extension icon or press `Alt + Shift + M` to merge all windows.

- Normal and incognito windows are merged separately.
- To merge incognito windows, [allow incognito access](https://support.google.com/chrome/a/answer/13130396).
- Change the shortcut at `chrome://extensions/shortcuts`.

## Development

```bash
pnpm i --frozen-lockfile
pnpm build
```

Or with Docker:

```bash
docker compose up -d --build
docker compose exec node pnpm i --frozen-lockfile
docker compose exec node pnpm build
```

## License

[MIT](LICENSE)
