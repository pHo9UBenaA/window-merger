# Releases

This guide is for maintainers who merge release pull requests and publish to the Chrome Web Store.
For local setup and checks, see the [development guide](development.md).

## Release checklist

1. Create `release/vX.Y.Z`, set that version in
   [`src/assets/manifest.json`](../src/assets/manifest.json), and open a pull request to `main`.
2. Confirm that **all automatically triggered pull-request checks are green on the latest
   revision**. This includes the `checks` job in [CI](../.github/workflows/ci.yml), which validates
   the release branch version as well as running the automated tests and checks.
3. Complete the remaining checks in the [development guide](development.md#tests-and-checks).
   Run **Actions → Browser matrix → Run workflow** on the release branch and confirm that all
   jobs, including `compatibility-gate`, succeed. This workflow is manual, not a PR check.
   After any new commits, repeat the automated and manual checks for the updated revision.
4. Merge the pull request into `main`. Confirm that
   [Auto Tag on Merge](../.github/workflows/create-tag-on-merge.yml) succeeds and that `vX.Y.Z`
   points to the PR's merge commit. Also confirm that CI on that `main` commit is green.
5. Check out `vX.Y.Z`, install dependencies with `pnpm install --frozen-lockfile`, and run
   `pnpm zip` to rebuild, validate and archive `dist/` as `dist.zip`.
6. Inspect the extracted ZIP before uploading `dist.zip` to the Chrome Web Store.

Tag creation does **not** create a GitHub Release or upload anything to the Chrome Web Store.
Store publication is a separate, manual step requiring the appropriate store access.

## Release scripts

### `scripts/release.ts`

[The release script](../scripts/release.ts) has two modes:

- **`--check`**: validate the version in `RELEASE_BRANCH` against the manifest at
  `RELEASE_COMMIT` (defaults to `HEAD`). CI uses this to detect version mismatches before merge.
- **No arguments**: validate and publish `vX.Y.Z` to `origin` at the exact `RELEASE_COMMIT`.
  Both `RELEASE_BRANCH` and `RELEASE_COMMIT` are required. Auto Tag on Merge supplies the PR's
  source branch and merge commit; normally there is no need to run this mode locally.

Release refs must be `release/vX.Y.Z` or `vX.Y.Z` (including their full Git ref forms).
Other branch names are skipped. Versions must also satisfy Chrome's extension-version rules.

Tag publication never overwrites an existing remote tag. An existing tag at the same commit
is a successful no-op; a tag at a different commit is an error. A new release must be newer
than every existing remote release tag. Local tags are neither consulted nor changed.

### `scripts/pre-push.ts`

[The push-check script](../scripts/pre-push.ts) reads Git's pre-push records from standard input.
It checks both the local and destination ref against the manifest in the commit being pushed,
so pushing to a differently named remote branch or tag is checked too. Deletions are skipped.
It never creates or pushes tags.

The optional [pre-push hook](../.githooks/pre-push) invokes it before the other local checks.
See [Git hooks](development.md#git-hooks) for enabling hooks.

### `scripts/lib/`

- [`release-version.ts`](../scripts/lib/release-version.ts) shares release-ref parsing and
  committed-manifest version checks between the release and push-check scripts.
- [`validate-extension.ts`](../scripts/lib/validate-extension.ts) validates the built extension
  before packaging, and supplies the Chrome extension-version validation used by release checks.

These are supporting modules, not standalone commands.
