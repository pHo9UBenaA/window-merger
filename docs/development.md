# Development

## Getting started

You need:

- **Node.js 24.21 or later in the 24.x line** and **pnpm**, as specified by
  [`engines.node` and `packageManager` in `package.json`](../package.json).
- **`zip` and `unzip`** on `PATH` for packaging and artifact tests.
- **[OSV Scanner v2](https://google.github.io/osv-scanner/installation/)** on `PATH` for
  [`pnpm check:dependencies`](#tests-and-checks).

## Development workflow

```sh
pnpm build --watch
```

Add `--no-minify` for readable JavaScript.

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

### Browser tests

Install Playwright's Chromium once before running browser tests:

```sh
pnpm exec playwright install chromium

# Linux: install Chromium with system dependencies instead
pnpm exec playwright install --with-deps chromium
```

Run headed and stress tests:

```sh
# Run with a visible browser
HEADED=1 pnpm test:browser

# Run for merge-related changes (200 tabs)
pnpm test:stress
```

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

The compatibility command runs only `@compat` scenarios.

Refresh patches or extend the range when Stable advances with `pnpm chrome:update-lock`.
Commit the lock diff as a separate maintenance change; tests and CI never select versions themselves.

## Git hooks

Enable the optional hooks after installing dependencies:

```sh
git config core.hooksPath .githooks
```

Disable the hooks with `git config --unset core.hooksPath`.

## Releases

1. Create `release/vX.Y.Z` and set that version in
   [`src/assets/manifest.json`](../src/assets/manifest.json).
2. Complete the tests and checks, including the manual Browser matrix workflow.
3. Run `pnpm zip` to rebuild, validate and archive `dist/` as `dist.zip`.
4. Inspect the extracted ZIP before uploading it to the Chrome Web Store.
