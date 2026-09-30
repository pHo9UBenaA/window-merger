# Development

## Environment and build

Use the Node.js version in [`.nvmrc`](../.nvmrc) and the pnpm version declared by
[`package.json`](../package.json). Enable Corepack if available, or install that pnpm version directly.
Packaging requires the system `zip` command; artifact tests also require `unzip`.
These commands are checked on macOS and Linux, not Windows.

```sh
pnpm install --frozen-lockfile
pnpm build
```

In `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`.
Use a disposable profile. After rebuilding, click **Reload**; a build does not reload Chrome.
The service-worker inspector shows logged failures. `pnpm build --watch` watches source and assets.
The build target comes from `minimum_chrome_version` in the manifest; restart the watcher after
changing that setting.

## Git hooks

Enable the optional hooks after installing dependencies:

```sh
git config core.hooksPath .githooks
```

- `pre-commit` runs Secretlint and Biome on a temporary export of the Git index, without changing
  working-tree edits. Markdown-only changes run Secretlint only.
- `commit-msg` checks Conventional Commits.
- `pre-push` checks release versions against pushed commits, then runs lint, type checks, and coverage.

Hooks reuse installed tooling. Install dependencies from the staged lockfile when changing them.
CI independently installs from the committed lockfile and also checks packaging and browser behavior.
Require the CI `checks` job through branch protection; local hooks are not server-side enforcement.
See [testing](testing.md) for commands and the release checklist.

## Docker

On a non-root Unix host, match the container's UID/GID to the repository owner:

```sh
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
docker compose up -d --build
docker compose exec node pnpm install --frozen-lockfile
docker compose exec node pnpm build
```

The repository is bind-mounted; `node_modules` uses a container-only volume to avoid mixing host
and container binaries. After changing UID/GID or architecture, recreate that disposable volume
and reinstall dependencies. `docker compose down -v` deletes the dependency volume, not repository files.
The slim image does not preinstall ZIP tools or browser dependencies; run those checks on the host or in CI.

## Packaging and releases

```sh
pnpm zip
```

This builds and validates a fresh minified extension, then creates `dist.zip` with the manifest at its
root. Old output is removed first; failed builds or ZIP commands do not leave a publishable archive.
Missing translations can fall back to the default locale. The extension version and minimum Chrome
version are maintained in [`src/assets/manifest.json`](../src/assets/manifest.json).

Create `release/vX.Y.Z`, set the manifest version to `X.Y.Z`, and use Conventional Commits.
Complete the [release checks](testing.md#manual-release-matrix), then open a PR to `main`.
CI checks the branch/manifest versions. On merge, the tagging workflow creates `vX.Y.Z` at the exact
merged commit. An identical existing tag is a no-op; conflicts and version regressions fail without
overwriting tags. Legacy `vX.Y.Z` release branches remain supported.

Tagging does not publish to the Chrome Web Store. Inspect the extracted ZIP and upload it manually.
Security overrides in `pnpm-workspace.yaml` are narrowly pinned; revisit them when updating dependencies.

## Merge behavior

Only ordinary windows in the accessible profile participate; normal and incognito modes remain separate.
The focused eligible window is preferred, otherwise the smallest window ID is used. The selected active
tab is restored when possible. Windows are not explicitly focused or restored from minimization.
No tab ordering is guaranteed.

A merge uses its initial snapshot, not continuous reconciliation. Newly opened tabs may remain behind;
a moved group includes its members at the time it is moved. Duplicate requests for the same mode are
ignored until started operations settle. Normal and incognito merges can run independently.

On failure, started parallel operations finish and subsequent stages stop. Partial changes are allowed;
there is no rollback, automatic retry, or persisted resume job. Errors go to the service-worker console,
without user notifications.
