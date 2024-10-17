# Merge Window Extension

A Chrome extension that helps you efficiently manage browser windows by merging multiple windows into one.

## Features

- Merges all windows belonging to the same profile
- Merges all incognito windows of the same profile (if allowed)
- Simple activation via left-click or keyboard shortcut (Ctrl/Cmd + M)
- Privacy-focused: Regular windows and incognito windows are kept separate

## Installation

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/merge-window-extension/fijodggmkbkjcmlpkpahjpepngppdppb).

## Development

1. Build the docker image

```bash
docker compose up -d --build
```

2. Install the dependencies

```bash
docker compose exec node pnpm i --frozen-lockfile
```

3. Build the extension

```bash
docker compose exec node pnpm run build
```
