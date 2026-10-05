# Development

## Setup and build

Use the Node.js version in [`.nvmrc`](../.nvmrc) and the pnpm version in
[`package.json`](../package.json). Install `zip` and `unzip` for packaging and artifact tests.

```sh
pnpm install --frozen-lockfile
pnpm build
```

In `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`.
Use a disposable profile. Click **Reload** after rebuilding and check the service-worker console.

Use `pnpm build --watch` while editing. Restart it after changing `minimum_chrome_version` in
[`src/assets/manifest.json`](../src/assets/manifest.json). For readable JavaScript when debugging,
use `pnpm build --no-minify` (also supported with `--watch`).

## Checks

Install the official [OSV Scanner v2](https://google.github.io/osv-scanner/installation/) on `PATH`
for dependency audits. Install Chromium for browser tests:

```sh
pnpm exec playwright install chromium
```

Before opening a PR, run:

```sh
pnpm test:coverage
pnpm typecheck
pnpm typecheck:tsc
pnpm run ci
pnpm check:secrets
pnpm check:dependencies
pnpm test:browser
```

For merge-related changes, also run `pnpm test:stress` (200 tabs by default).
Use `STRESS_TABS=500 pnpm test:stress` for larger cases or `HEADED=1 pnpm test:browser` to see Chrome.

Before a release, use disposable profiles on the minimum supported Chrome version and current stable
Chrome. Record browser/OS/version, results and console errors:

- Try the toolbar, shortcut reassignment and both context-menu entries.
- Toggle incognito access, restart Chrome and disable/re-enable the extension; check normal and
  incognito merges remain separate.
- Merge pinned, muted, active and grouped tabs, including collapsed groups and a source's last tab.
- Change or close tabs during a merge; check errors and whether a subsequent merge works.
- Inspect the extracted release ZIP's version, icons and localized text, and repeat the UI checks.

Do not attach private URLs or a personal browser profile to bug reports.

### Manual browser matrix

`pnpm test:browser` runs the full integration suite on Playwright-managed Chromium. CI runs it on
ubuntu-latest; the `Browser matrix` workflow runs it on Linux, Windows and Apple Silicon macOS on
demand. `pnpm test:browser:compat` runs only the `@compat` scenarios: both merge directions through
the action and the context menu, exact pinned and unpinned order, group identity/member order and
metadata, active and muted states, popups, and no tab loss.

[`test/browser/chrome-versions.json`](../test/browser/chrome-versions.json) locks one Chrome for Testing
**full Chrome** patch per major, from the manifest minimum to Stable. Tests never resolve or change
versions. To test a locked major locally:

```sh
pnpm chrome:install 120 mac-arm64 # or linux64 / win64
# CHROME_EXECUTABLE_PATH is printed by the installer (use a disposable profile).
CHROME_EXECUTABLE_PATH='/path/to/chrome' CHROME_MAJOR=120 HEADED=1 pnpm test:browser:compat
```

The fixture verifies the launched major over CDP and fails on a mismatch. Linux headed runs need
`xvfb-run -a`; Windows needs `zip` and `unzip`. Do not use `chrome-headless-shell` for extensions.

Run **Actions → Browser matrix → Run workflow** before a release. It runs the browser suite on
ubuntu-24.04, windows-2025 and macos-15, then the oldest and newest locked Chrome on ubuntu-24.04,
windows-2025 and macos-14. macOS uses `macos-14` because Chrome for Testing 120 cannot launch on
`macos-15` arm64; that is a property of those binaries, not of the extension. The workflow is manual
and never gates a pull request. Uploaded `test-results` artifacts carry the Playwright JSON report,
ordering snapshots and failure context.

Refresh patches, or extend the range when Stable advances, with `pnpm chrome:update-lock`, then review
and commit the lock diff as its own maintenance change. The updater reads the Chrome for Testing
milestone and Stable endpoints and verifies that full binaries exist for every platform in the matrix
before writing the lock. CI reads the lock and never picks versions by itself.

## Dependencies and Git hooks

```sh
pnpm update --latest --config.frozen-lockfile=false
```

Review catalog, override and lockfile changes against
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml); keep Node typings on the runtime's major version.
After manual dependency edits, run `pnpm install --no-frozen-lockfile`, then verify frozen installation
and rerun the checks above.

Enable the optional Git hooks after installing dependencies:

```sh
git config core.hooksPath .githooks
```

Use Conventional Commits. Open PRs against `main` and wait for CI checks to pass.

## Docker (optional)

On a non-root Unix host:

```sh
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
docker compose up -d --build
docker compose exec node pnpm install --frozen-lockfile
docker compose exec node pnpm build
```

After changing UID/GID or architecture, run `docker compose down -v`, recreate the container, and
reinstall dependencies. This deletes the dependency volume, not repository files.
Run packaging and browser checks on the host or in CI; their system tools are not installed in the image.

## Releases

Create `release/vX.Y.Z` and set that version in
[`src/assets/manifest.json`](../src/assets/manifest.json). Complete the checks above, then run `pnpm zip`
to rebuild, validate and archive `dist/` without further transformations. Inspect `dist.zip` before
uploading it to the Chrome Web Store. Merging the release PR creates the version tag, not a store upload.
