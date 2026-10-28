# Development

## Getting started

You need:

- **Node.js 24.21 or later in the 24.x line** and **pnpm**, as specified by
  [`engines.node` and `packageManager` in `package.json`](../package.json).
  Use any Node.js version manager; CI reads the same Node.js requirement.
- **`zip` and `unzip`** on `PATH` for packaging and artifact tests.

```sh
git clone https://github.com/pHo9UBenaA/window-merger.git
cd window-merger
pnpm install --frozen-lockfile
pnpm build
```

Load the extension in a disposable Chrome profile:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `dist/`.
3. After rebuilding, click **Reload**. Inspect the extension's service worker to see logs and errors.

## Development workflow

```sh
pnpm build --watch
```

Source and asset changes rebuild automatically; reload the extension in Chrome to apply them.
Add `--no-minify` for readable JavaScript. Restart the watcher after changing
`minimum_chrome_version` in [`src/assets/manifest.json`](../src/assets/manifest.json).

| Path | Purpose |
| --- | --- |
| `src/background.ts` | Extension entry point and event wiring |
| `src/domain/` | Window-merge rules, independent of Chrome APIs |
| `src/application/` | Merge orchestration through ports |
| `src/ports/`, `src/adapters/chrome/` | API contracts and Chrome implementations |
| `src/assets/` | Manifest, icons and translations |
| `scripts/` | Build, packaging and maintenance tools |
| `test/unit/`, `test/browser/` | Unit and packaged-extension tests |

## Tests and checks

Run `pnpm test` for a quick unit-test pass. Before opening a pull request, run:

```sh
pnpm run ci
pnpm typecheck
pnpm typecheck:tsc
pnpm test:coverage
pnpm check:secrets
pnpm check:dependencies
pnpm test:browser
```

`pnpm run ci` checks formatting and lint rules without modifying files. Use `pnpm check` to apply
Biome fixes locally. Dependency audits require the official
[OSV Scanner v2](https://google.github.io/osv-scanner/installation/) on `PATH`.

### Browser tests

Install Playwright's Chromium once before running browser tests:

```sh
pnpm exec playwright install chromium
```

On Linux, use `pnpm exec playwright install --with-deps chromium` to install system dependencies too.
Browser tests rebuild and test `dist.zip` using temporary profiles. Use
`HEADED=1 pnpm test:browser` to see the browser.

For merge-related changes, also run `pnpm test:stress` (200 tabs by default).
Use `STRESS_TABS=500 pnpm test:stress` for a larger case.
These environment-variable examples use POSIX shell syntax; set them separately in PowerShell.

### Chrome compatibility

Run **Actions → Browser matrix → Run workflow** before a release or to investigate platform
differences. It covers Linux, Windows and macOS, including locked Chrome for Testing versions.
This workflow is manual and does not gate pull requests; reports and failure context are uploaded
as `test-results` artifacts.

[`test/browser/chrome-versions.json`](../test/browser/chrome-versions.json) locks one full patch
version per major, from the manifest minimum to Stable. To test a locked major locally:

```sh
pnpm chrome:install 120 mac-arm64 # or linux64 / win64
CHROME_EXECUTABLE_PATH='/path/printed/by/installer' CHROME_MAJOR=120 HEADED=1 pnpm test:browser:compat
```

The compatibility command runs only `@compat` scenarios. On Linux, use `xvfb-run -a` before `pnpm`
when running headed without a display.

Refresh patches or extend the range when Stable advances with `pnpm chrome:update-lock`.
Commit the lock diff as a separate maintenance change; tests and CI never select versions themselves.

## Git hooks

Enable the optional hooks after installing dependencies:

```sh
git config core.hooksPath .githooks
```

| Hook | Checks |
| --- | --- |
| `pre-commit` | Secretlint on the staged snapshot; Biome when staged changes include non-Markdown files |
| `commit-msg` | Conventional Commits |
| `pre-push` | Release branch/version consistency, Biome, type checking and unit-test coverage |

The pre-commit hook does not modify the working tree or index. Hooks are a local convenience,
not a replacement for the full checks above. Disable them with `git config --unset core.hooksPath`.

Use a descriptive branch such as `fix/preserve-tab-order`, follow
[Conventional Commits](https://www.conventionalcommits.org/), and open pull requests against `main`.
Wait for CI to pass before merging.

## Updating dependencies

```sh
pnpm update --latest --config.frozen-lockfile=false
```

Review catalog, override and lockfile changes against
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml). Keep Node.js typings on the runtime's major version.
After manual dependency edits, run `pnpm install --no-frozen-lockfile`. Then verify
`pnpm install --frozen-lockfile` and rerun the tests and checks.

## Releases

1. Create `release/vX.Y.Z` and set that version in
   [`src/assets/manifest.json`](../src/assets/manifest.json).
2. Complete the tests and checks, including the manual Browser matrix workflow.
3. Run `pnpm zip` to rebuild, validate and archive `dist/` as `dist.zip`.
4. Inspect the extracted ZIP and complete the manual checks below before uploading it to the
   Chrome Web Store.

Merging the release pull request creates the version tag; it does **not** upload to the store.

### Manual release checks

Use disposable profiles on the minimum supported Chrome version and current Stable.
Record the browser version, OS, results and console errors:

- Try the toolbar, shortcut reassignment and both context-menu entries.
- Toggle incognito access, restart Chrome and disable/re-enable the extension. Verify that normal
  and incognito merges remain separate.
- Merge pinned, muted, active and grouped tabs, including collapsed groups and a source's last tab.
- Change or close tabs during a merge. Check errors and whether a subsequent merge works.
- Check the extracted ZIP's version, icons and localized text, and repeat the UI checks with it.

Never include private URLs or a personal browser profile in bug reports.
