# Window Merger

A Chrome extension that merges browser windows while preserving pinned tabs, tab groups,
and mute states. Requires **Chrome 120 or later**.

## Installation

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/merge-window-extension/fijodggmkbkjcmlpkpahjpepngppdppb).

## Usage

Click the extension icon or press `Alt + Shift + M`. Normal and incognito windows are merged
separately. Context-menu entries let you merge either mode individually.

- Only ordinary windows in the accessible browser profile are merged.
- To merge incognito windows, [allow incognito access](https://support.google.com/chrome/a/answer/13130396).
- Tab ordering is not guaranteed. A failed merge may leave some tabs already moved.
- Change the shortcut at `chrome://extensions/shortcuts`.

See [merge behavior](docs/development.md#merge-behavior) for the detailed guarantees and limitations.

## Development

- [Environment, build, Git hooks, Docker, and releases](docs/development.md)
- [Automated tests and manual release checks](docs/testing.md)

## License

[MIT](LICENSE)
