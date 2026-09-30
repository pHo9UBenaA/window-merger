# Git Hooks

Enable once after cloning:

```sh
git config core.hooksPath .githooks
```

Install the locked dependencies first. `pre-commit` checks a temporary export of the Git index
with Secretlint, Biome, the type checker, and unit tests. It reuses installed tooling but never
stashes, stages, or modifies your working-tree edits. Partial staging is supported. Temporary
snapshots are removed on success or failure. Documentation-only commits (Markdown files) still run
Secretlint but skip code checks. Any other staged path, including a deleted code file or code renamed
to Markdown, runs all code checks. Browser tests remain separate; CI always runs the full suite.

When changing dependencies, install the versions represented by the staged lockfile before
committing. CI installs from the committed lockfile independently; hooks are not a substitute
for required CI checks.

`commit-msg` checks Conventional Commits. `pre-push` checks release branch/tag versions against
the pushed commit (not the working tree), then runs lint, type checks, coverage, and packaging.
Release branches use `release/vX.Y.Z`; legacy `vX.Y.Z` branches and tags are also validated.
