# Releases

This guide is for maintainers with permission to merge into `main`, run GitHub Actions workflows,
and publish the extension in the Chrome Web Store. Run commands from the repository root with the
[development prerequisites](development.md#getting-started) installed.

Merging a release pull request automatically creates a tag, but not a GitHub Release or a store
publication. Packaging and store publication are manual.

## Release checklist

Replace `X.Y.Z` below with a version newer than every release tag on `origin`. Use three numeric
components, each from 0 to 65535, without leading zeros; `0.0.0` is invalid.

1. Create the release branch from the latest `main`:

   ```sh
   git fetch origin
   git switch -c release/vX.Y.Z origin/main
   ```

   Set `version` to `X.Y.Z` in [`src/assets/manifest.json`](../src/assets/manifest.json), then
   commit and push it:

   ```sh
   git add src/assets/manifest.json
   git commit -m "chore: release vX.Y.Z"
   git push -u origin release/vX.Y.Z
   ```

   Open a pull request from `release/vX.Y.Z` to `main`.
2. Confirm that all automatically triggered pull-request checks are green on the latest revision.
3. Run **Actions → Browser matrix → Run workflow**, selecting `release/vX.Y.Z` as the branch.
   For merge-related changes, enable **Also run the 200-tab stress test**. Confirm that the
   workflow succeeds for the latest release-branch commit. It does not run automatically on PRs.
   After any new commits, return to step 2.
4. Merge the pull request into `main`. Confirm that
   [Auto Tag on Merge](../.github/workflows/create-tag-on-merge.yml) succeeds, `vX.Y.Z` points to
   the PR's merge commit, and CI on that commit is green.
5. With a clean working tree, fetch and check out the tag, then build the store package:

   ```sh
   git fetch origin tag vX.Y.Z
   git switch --detach vX.Y.Z
   pnpm install --frozen-lockfile
   pnpm zip
   ```

   Confirm that the command succeeds and creates `dist.zip`.
6. Extract the ZIP into a temporary directory:

   ```sh
   inspection_dir=$(mktemp -d)
   unzip -q dist.zip -d "$inspection_dir"
   printf 'Inspect: %s\n' "$inspection_dir"
   ```

   Inspect the extracted manifest and bundled files for missing assets or unintended changes.
   Confirm that the manifest version is `X.Y.Z`. If source changes are needed after tagging,
   restart at step 1 with a newer version.
7. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   select the existing extension, upload `dist.zip`, and submit it for review. Confirm that the
   new version is published after approval.
