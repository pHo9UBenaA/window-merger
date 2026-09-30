# Window Merger

A Chrome extension that merges browser windows while preserving pinned tabs, tab groups,
and mute states. Requires **Chrome 120 or later**.

## Installation

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/merge-window-extension/fijodggmkbkjcmlpkpahjpepngppdppb).

## Usage and guarantees

Click the extension icon or press `Alt + Shift + M`. The action merges normal and incognito
windows separately. Context-menu entries let you merge either mode individually.

- Only ordinary browser windows in the extension's accessible profile are merged. Popups,
  app windows, and developer-tools windows are excluded; other Chrome profiles are not merged.
- To merge incognito windows, [allow incognito access](https://support.google.com/chrome/a/answer/13130396).
- **No tab ordering is guaranteed**, including ordering between groups, pinned tabs, and ordinary tabs.
- The focused eligible window is preferred as the target; otherwise the smallest window ID is used.
  The target's active tab is restored when possible. Windows are not explicitly brought to the front
  or restored from minimization. Focus in other applications/popups is outside the guarantee.
- A merge uses the state captured at its start. Changes made while it runs are not fully reconciled.
  Newly opened tabs may remain behind; a moved group includes its members at the time it is moved.
- Repeated requests for the same mode are ignored until the current attempt's started operations
  have settled. Normal and incognito merges are independent.
- A failed operation may leave some tabs already moved. Started parallel operations are allowed to
  finish, but subsequent steps stop. There is no rollback, automatic retry, or persisted resume job.
  Errors are written to the extension's service-worker console, without user notifications.
- Change the shortcut at `chrome://extensions/shortcuts`.

## Development

Use Node.js **24.18.0 or later in the 24.x line** (`.nvmrc`) and the exact pnpm version in
`package.json` (currently 11.3.0). With Corepack available, enable it to select that version,
or install that pnpm version directly.

```sh
nvm use # optional, if you use nvm
corepack enable # optional, if Corepack is installed
pnpm install --frozen-lockfile
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select
`dist/`. Use a disposable profile for testing. After rebuilding, click the extension's **Reload**
button; a source rebuild does not reload Chrome automatically. Click its service-worker inspector
link to see failures. `pnpm build --watch` watches both TypeScript and static assets.

See [testing and the manual release matrix](docs/testing.md) and [Git hook setup](.githooks/README.md).
Configure branch protection to require the `checks` job before
merging; a local hook is optional and is not the server-side enforcement mechanism.

### Docker

Docker uses the same Node.js and pnpm versions. On a non-root Unix host, match the container's UID/GID
to the repository owner before building. Defaults are 1000/1000 where no values are supplied.

```sh
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
docker compose up -d --build
docker compose exec node pnpm install --frozen-lockfile
docker compose exec node pnpm build
```

The repository is bind-mounted; dependencies use a container-only named volume,
not the host's `node_modules`. If changing the UID/GID or architecture, recreate these disposable
volume and reinstall dependencies. `docker compose down -v` deletes this dependency volume,
not repository files. Browser tests require Playwright's browser and OS libraries; the slim development
image does not preinstall them. Run browser tests on the host or in CI.

## Packaging and releases

```sh
pnpm zip
```

This builds a fresh minified extension, validates its manifest/assets/locales, and writes `dist.zip`
with `manifest.json` at its root. The system `zip` command is required. Failed builds do not produce a
replacement archive; deleted source assets do not survive from an older archive.

Create a `release/vX.Y.Z` branch, update `src/assets/manifest.json` to `X.Y.Z`, and make Conventional
Commits. Complete the [release matrix](docs/testing.md) and submit a pull request to `main`. CI checks
that the branch version matches the manifest. On merge, the tagging workflow tags the exact merged
commit as `vX.Y.Z`. An identical existing tag is a no-op; conflicting tags and version regressions fail
without overwriting tags. Legacy `vX.Y.Z` release branches are still recognized.

Tag creation does not upload to the Chrome Web Store. Review the extracted ZIP and upload it manually.
Audit exceptions for patched transitive dependencies are narrowly version-pinned in
`pnpm-workspace.yaml`; revisit them when upgrading their parent packages.

## License

[MIT](LICENSE)
