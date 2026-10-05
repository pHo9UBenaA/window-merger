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

### Chrome compatibility

`pnpm test:browser` runs the full integration suite on Playwright-managed Chromium. CI runs it on
Linux, Windows and Apple Silicon macOS. `pnpm test:browser:compat` runs only the `@compat` scenarios:
both merge directions through action and context menu, normal/incognito separation, exact pinned and
unpinned order, group identity/member order/metadata, active/muted states, popups and no tab loss.

[`test/browser/chrome-versions.json`](../test/browser/chrome-versions.json) locks one Chrome for Testing
**full Chrome** patch per major, from the manifest minimum to Stable. Tests do not resolve or change
versions. To test a locked major locally:

```sh
pnpm chrome:install 120 mac-arm64 # or linux64 / win64
# Set the executablePath printed by the installer (use a disposable profile).
CHROME_EXECUTABLE_PATH='/path/to/chrome' CHROME_MAJOR=120 HEADED=1 pnpm test:browser:compat
```

Linux headed runs require `xvfb-run -a`; CI installs Chrome's system dependencies. Windows runners
install `zip`/`unzip` with Chocolatey. The fixture checks the actual browser major via CDP and attaches
its version plus before/after ordering snapshots. Do not use `chrome-headless-shell` for extensions.

To refresh patches or extend the range when Stable advances, run `pnpm chrome:update-lock`, review
and commit the lock diff as an explicit maintenance change, then rerun the full matrix. The updater
uses Chrome for Testing's milestone/Stable APIs and verifies full binaries for all three platforms
before writing the lock. CI derives the matrix from the lock: every major on `ubuntu-24.04/linux64`,
`windows-2025/win64` and `macos-15/mac-arm64`, with both directions in each job. It does not infer window
creation order from window IDs.

Merge, artifact and browser-fixture PRs and all release branches run the full compatibility matrix;
docs-only or unrelated tooling PRs can skip it. `workflow_dispatch` always runs it. Failures do not
cancel other versions; concurrency is capped at 12. Configure branch protection to require `checks`,
the three `browser` jobs and `compatibility-gate` (the gate also succeeds for an intentional skip).
A workflow alone cannot configure required checks in GitHub repository settings.

Do not publish the ordering guarantee or bump to `v1.5.0` until every locked major/OS passes. Before
release, check the lock reaches current Stable and rerun the full matrix if Stable has advanced. Keep
any v1.4.9 / Chrome 113–119 historical investigation separate from current support acceptance; record
the extension commit, browser/OS/version and before/after snapshots, including launch failures.

### Manual release checks

Before a release, use disposable profiles on the minimum supported Chrome version and current stable
Chrome. Record browser/OS/version, results and console errors:

- Try the toolbar, shortcut reassignment and both context-menu entries.
- Toggle incognito access, restart Chrome and disable/re-enable the extension; check normal and
  incognito merges remain separate.
- Merge pinned, muted, active and grouped tabs, including collapsed groups and a source's last tab.
- Change or close tabs during a merge; check errors and whether a subsequent merge works.
- Inspect the extracted release ZIP's version, icons and localized text, and repeat the UI checks.

Do not attach private URLs or a personal browser profile to bug reports.

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
