# Window Merger

A Chrome extension that lets you efficiently manage your browser windows by merging them into one.

## Features

- Merge all windows of the same profile.
- Merge all incognito windows (if permission is granted for incognito mode).
- Preserve pinned tabs, tab groups, and tab mute states when merging.
- Activate easily by clicking the extension icon or pressing `Ctrl/Command + M`.

## Important Information

1. For instructions on enabling the extension in incognito mode, see: [Google Support](https://support.google.com/chrome/a/answer/13130396)
2. If the shortcut keys do not work, go to `chrome://extensions/shortcuts` and reassign the keys.

## Installation

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/merge-window-extension/fijodggmkbkjcmlpkpahjpepngppdppb).

## Development

1. Install the dependencies

```bash
bun i --frozen-lockfile
```

2. Build the extension

```bash
bun run build
```

### With Containers

<details>

1. Build the docker image

```bash
docker compose up -d --build
```

2. Install the dependencies

```bash
docker compose exec bun bun i --frozen-lockfile
```

3. Build the extension

```bash
docker compose exec bun bun run build
```

</details>

## License

[MIT](LICENSE).
