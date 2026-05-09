# Window Merger

A Chrome extension that merges multiple browser windows into one, preserving tab groups and pinned tabs.

## Features

- Merge all normal windows within the same profile
- Merge all incognito windows (requires incognito access)
- Preserve pinned tabs, tab groups, and tab mute states when merging
- Click the extension icon or press `Alt + Shift + M` to merge windows

## Notes

1. To enable incognito access, see: [Google Support](https://support.google.com/chrome/a/answer/13130396)
2. If the shortcut does not work, you can reconfigure it at `chrome://extensions/shortcuts`

## Installation

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/merge-window-extension/fijodggmkbkjcmlpkpahjpepngppdppb).

## Development

1. Install the dependencies

```bash
pnpm i --frozen-lockfile
```

2. Build the extension

```bash
pnpm build
```

### Using Docker Compose

1. Build the Docker image

```bash
docker compose up -d --build
```

2. Install the dependencies

```bash
docker compose exec node pnpm i --frozen-lockfile
```

3. Build the extension

```bash
docker compose exec node pnpm build
```

## License

[MIT](LICENSE)
