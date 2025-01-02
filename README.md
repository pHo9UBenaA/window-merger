# Window Merger

A Chrome extension designed to help you efficiently manage your browser by merging multiple windows into one.

## Features

- Merge all windows of the same profile.
- Merge all incognito windows of the same profile (if permission is granted for incognito mode).
- Simple activation via left-click on the extension icon or keyboard shortcut (Control/Command + M).
- Privacy-focused: Regular windows and incognito windows are kept separate.
- If tabs are in groups, the groups will stay the same when the windows are merged.

## Important Information

1. For instructions on enabling the extension in incognito mode, see: [Google Support](https://support.google.com/chrome/a/answer/13130396)
2. If the shortcut keys do not work, go to `chrome://extensions/shortcuts` and reassign the keys.

## Installation

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/merge-window-extension/fijodggmkbkjcmlpkpahjpepngppdppb).

## Development

### Without Containers

1. Install the dependencies

```bash
bun i --frozen-lockfile
```

2. Build the extension

```bash
bun run build
```

### With Containers

1. Build the docker image

```bash
docker compose up -d --build
```

2. Install the dependencies

```bash
docker compose exec bub bun i --frozen-lockfile
```

3. Build the extension

```bash
docker compose exec bun bun run build
```
