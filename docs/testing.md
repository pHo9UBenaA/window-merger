# Testing

## Automated checks

Set up the [development environment](development.md#environment-and-build) first.

```sh
pnpm test:coverage
pnpm typecheck
pnpm typecheck:tsc
pnpm run ci
pnpm check:secrets
pnpm audit
pnpm zip
PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright install chromium
pnpm test:browser
pnpm test:stress
```

The unit suite covers planning, all event entry points, callback errors, duplicate requests,
partial failures, menu permission synchronization, packaging, and watched assets. Coverage
thresholds apply to production `src/` code; build and release tools have separate tests.

Browser tests use Playwright's full Chromium with a fresh temporary persistent profile.
They never use your normal browser profile. A **test-only prelude** captures the production
registered action/menu listeners so tests can invoke those listeners; Chrome's tab, group,
window, and menu APIs remain real. The prelude is only added to a temporary extension copy,
not `dist/` or the ZIP. These tests do not simulate physical toolbar clicks or keyboard shortcuts.

Tests check tab identity (not ordering), pinned/muted state, group metadata, normal/incognito
separation, permission changes, browser restarts, and exclusion of popups. Incognito permission
is changed through Chromium's extensions-management page API in the temporary profile; this
private test API may need adapting when Playwright updates. The production extension uses only
public APIs. State synchronization is also tested independently with callback-accurate unit mocks.

The stress project is separate from ordinary browser tests. It defaults to 200 blank tabs:

```sh
STRESS_TABS=500 pnpm test:stress
HEADED=1 pnpm test:browser
```

Use a machine with enough memory. The stress test records merge duration and verifies that tab
IDs are neither lost nor duplicated. It has a generous timeout, not a hardware-independent
performance guarantee. CI runs stress tests only when explicitly requested.

## Manual release matrix

Run in a disposable profile, on the minimum Chrome version declared in the manifest and the current
stable Chrome, on supported desktop OSes. Playwright's current Chromium does not establish compatibility
with every older Chrome build.
Record browser/OS/version, setup, actual result, and console errors. Never attach private URLs or
an entire personal profile to a bug report.

- Load the unpacked `dist/` build and also the extracted release ZIP; verify icons and localized text.
- Use the toolbar, `Alt+Shift+M`, and both context-menu entries. Confirm shortcut reassignment works.
- Toggle “Allow in incognito” without restarting the browser. Verify the menu's enabled state and
  real incognito merges, then disable permission and repeat. Also disable/re-enable the extension.
- Stop its service worker from extension developer tools and wake it again; menus must not duplicate.
- Merge fixed, grouped, ordinary, muted, and active tabs, including a source's last tab. No tab order
  is guaranteed. Selected tabs are preserved where the initial snapshot remains valid; windows
  are not explicitly focused or restored from minimization.
- Check saved/shared/collapsed group behavior and discarded/frozen/loading/media tabs. Standard group
  identity/metadata and pinned/muted state are the intended preservation targets; platform-specific
  states not covered automatically must be verified rather than assumed to work.
- Close or change a tab/window during a merge. Partial changes are allowed; failures must be logged,
  no notification is expected, and another request must be accepted after in-flight work settles.
- Interrupt a large merge by closing the browser or updating the extension, then invoke a new merge.
  There is no persisted job or automatic resume/rollback guarantee.
- Inspect the final ZIP's root manifest, version, icons, locales and background script before upload.

GitHub Actions execution, branch protection, Docker on differing host UIDs/architectures, and actual
Chrome Web Store acceptance require validation in those environments. Local automated checks do
not mark this entire manual matrix as completed.
