# Development

## Environment and build

Use the Node.js version in [`.nvmrc`](../.nvmrc) and the pnpm version in
[`package.json`](../package.json). Packaging requires `zip`; artifact and browser tests also require
`unzip`. Development commands are tested on macOS and Linux.

```sh
pnpm install --frozen-lockfile
pnpm build
```

In `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`.
Use a disposable profile. Click **Reload** after rebuilding; the build does not reload Chrome.
Inspect the service-worker console for errors.

`pnpm build --watch` watches source and assets. The build target comes from
`minimum_chrome_version` in [`src/assets/manifest.json`](../src/assets/manifest.json); restart the
watcher after changing it. `--minify` minifies JavaScript; builds copy assets unchanged.

## Dependency updates

```sh
pnpm update --latest --config.frozen-lockfile=false
```

Review the catalog, overrides and lockfile against the policy in
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml). Keep `@types/node` on the runtime's major version.
Apply reviewed edits with `pnpm install --no-frozen-lockfile`, then verify frozen installation and
[run the checks](testing.md#automated-checks).

## Git hooks

```sh
git config core.hooksPath .githooks
```

- `pre-commit` checks secrets and Biome against an isolated copy of the Git index.
- `commit-msg` checks Conventional Commits.
- `pre-push` checks pushed release versions, lint, types and coverage.

Hooks use installed dependencies. Install from the staged lockfile after dependency changes.
CI independently runs checks; require its `checks` job through branch protection.

## Docker

On a non-root Unix host, match the container's UID/GID to the repository owner:

```sh
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
docker compose up -d --build
docker compose exec node pnpm install --frozen-lockfile
docker compose exec node pnpm build
```

The repository is bind-mounted; dependencies use a container-only volume. After changing UID/GID or
architecture, recreate that volume and reinstall dependencies. `docker compose down -v` deletes the
volume, not repository files. Git, ZIP tools and browser dependencies are not preinstalled.

## Packaging and releases

```sh
pnpm zip
```

Packaging builds minified JavaScript, compacts distribution JSON, and omits locale messages'
translator descriptions without changing source files. It includes `LICENSE`, validates the result,
and creates a fresh `dist.zip` with `manifest.json` at the root. Failed packaging leaves no publishable
archive.

Create `release/vX.Y.Z` and set the version in
[`src/assets/manifest.json`](../src/assets/manifest.json). Use Conventional Commits, complete the
[release checks](testing.md#manual-release-matrix), and open a PR to `main`.
On merge, CI creates the version tag at the merged commit. Conflicting tags and version regressions
are rejected; rerunning an identical tag is a no-op.

Tagging does not publish to the Chrome Web Store. Inspect the ZIP and upload it manually.
