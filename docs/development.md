# Development

## Getting started

Install the Node.js and pnpm versions specified in
[`engines.node` and `packageManager`](../package.json), plus `zip` and `unzip` on `PATH`.
Run commands from the repository root.

```sh
pnpm install --frozen-lockfile
```

## Development workflow

1. Start the watch build:

   ```sh
   pnpm build --watch
   ```

   Add `--no-minify` for readable JavaScript.

2. In Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**,
   and choose the repository's `dist/` directory.
3. After source or asset changes, wait for the rebuild and reload the extension in Chrome.

### Project layout

| Path | Purpose |
| --- | --- |
| `src/background.ts` | Extension entry point and event wiring |
| `src/domain/` | Window-merge rules, independent of Chrome APIs |
| `src/application/` | Merge orchestration through ports |
| `src/ports/`, `src/adapters/chrome/` | API contracts and Chrome implementations |
| `src/assets/` | Manifest, icons and translations |
| `scripts/` | Build, packaging and maintenance entry points |
| `scripts/lib/` | Supporting modules shared by scripts |
| `test/unit/`, `test/browser/` | Unit and packaged-extension tests |

## Tests and checks

For a quick unit-test pass:

```sh
pnpm test
```

Before opening a pull request, [install Chromium](#browser-tests) if needed, then run:

```sh
pnpm run ci
pnpm typecheck
pnpm typecheck:tsc
pnpm test:coverage
pnpm check:secrets
pnpm check:dependencies
pnpm test:browser
```

### Browser tests

Install Playwright's Chromium once before running browser tests:

```sh
pnpm exec playwright install chromium
```

On Linux, add `--with-deps` to install system dependencies.
For a visible browser, prefix `pnpm test:browser` with `HEADED=1`.

For merge-related changes, run the 200-tab stress test:

```sh
pnpm test:stress
```

### Chrome compatibility

Before a release or when investigating platform differences, run
**Actions → Browser matrix → Run workflow** on the branch to test.
Confirm that the workflow succeeds; inspect its artifacts if it fails.
This workflow is manual and does not gate pull requests.

#### Local compatibility tests

To test a specific Chrome major locally, choose one from
[`chrome-versions.json`](../test/browser/chrome-versions.json) whose version has a checksum
for your platform in [`chrome-checksums.json`](../test/browser/chrome-checksums.json).
For example, install Chrome 120 on Apple silicon macOS (`linux64` for Linux, `win64` for Windows):

```sh
pnpm chrome:install 120 mac-arm64
```

Replace `/path/to/chrome` below with `executablePath` from the installer's JSON output:

```sh
CHROME_EXECUTABLE_PATH='/path/to/chrome' CHROME_MAJOR=120 HEADED=1 pnpm test:browser:compat
```

This runs the `@compat` scenarios, not the full browser suite.

#### Update locked Chrome versions

When Stable advances:

```sh
pnpm chrome:update-lock
```

Review and commit `test/browser/chrome-versions.json` and `test/browser/chrome-checksums.json`
together as a separate maintenance change.

## Git hooks

Enable the optional hooks after installing dependencies:

```sh
git config core.hooksPath .githooks
```

To disable the hooks:

```sh
git config --unset core.hooksPath
```

## Releases

Maintainers publishing a release should follow the [release guide](releases.md).
