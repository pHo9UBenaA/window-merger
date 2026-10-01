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

## Merge behavior

The focused eligible window is preferred, otherwise the smallest window ID is used. The selected
active tab is restored when possible. Windows are not explicitly focused or restored from
minimization. Collapsed groups may expand during a merge.

A merge uses its initial snapshot, not continuous reconciliation. Newly opened tabs may remain
behind; a moved group includes its members at the time it is moved. Duplicate requests for the
same mode are ignored until started operations settle. Normal and incognito merges can run
independently.

On failure, started parallel operations finish and subsequent stages stop. There is no rollback,
automatic retry or persisted resume job. Errors go to the local service-worker console, without
user notifications.

## Privacy

Window and tab state is processed locally to perform merges. The extension does not transmit that
data or use analytics. See the [privacy policy](PRIVACY.md).

## Development

- [Environment, build, Git hooks, Docker, and releases](docs/development.md)
- [Automated tests and manual release checks](docs/testing.md)

## License

[MIT](LICENSE)
