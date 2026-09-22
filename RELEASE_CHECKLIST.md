# SQL Crack — Release Checklist

## Prepare the Release

- [ ] Open a reviewed PR from the intended release branch into `main`.
- [ ] Confirm `package.json` and `package-lock.json` contain the release version.
- [ ] Confirm `release.config.json` uses `pre-release` for a candidate or `stable` for a normal release.
- [ ] Date the versioned `CHANGELOG.md` heading on the intended publication day.
- [ ] Run `node scripts/validateReleaseChangelog.js 0.9.4` after setting the date and before merging; a push to `main` starts publication.
- [ ] Run `npm run audit:prod`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:perf`, and `npm run package`.
- [ ] Package a local VSIX with `npx @vscode/vsce@3.9.2 package --no-dependencies` (add `--pre-release` for a candidate) and inspect its file list.
- [ ] Wait for the required Node 20, Node 22, performance, and build checks on the PR.

## Publish

- [ ] Merge or fast-forward the validated release commit to `main` and push `main`.
- [ ] Do **not** create the version tag or publish to either registry manually.
- [ ] The push to `main` triggers `.github/workflows/release.yml`, which repeats the release gates, creates the GitHub release/tag, and publishes the same VSIX to configured registries.
- [ ] Confirm the GitHub release contains `sql-crack-vX.Y.Z.vsix`.
- [ ] Confirm the version appears on the VS Code Marketplace and Open VSX.

## 1.0 Candidate Flow

- Marketplace extension versions must stay numeric. Use `0.9.4` with the pre-release channel instead of `1.0.0-rc.1`.
- Keep `release.config.json` set to `pre-release` while validating the candidate. The workflow marks GitHub, Marketplace, and Open VSX publications as pre-release.
- Promote only blocker fixes during the candidate soak. For the stable release, change the package version to `1.0.0`, set the channel to `stable`, and finalize the changelog.
- Confirm both a clean install and an update from the latest stable extension before promotion.

## Resume a Partial Release

If a publication step fails after the tag exists:

1. Open **Actions → Release → Run workflow**.
2. Enter the tagged version without the `v` prefix.
3. Select only the failed target: `github-release`, `vscode-marketplace`, or `open-vsx`.
4. Run the workflow. It checks out the exact version tag, rebuilds and validates that source, and retries only the selected target.

Do not select `full-release` for an existing tag. Targeted Marketplace/Open VSX retries require their corresponding repository secret. The retry reads the channel from the requested tag; tags created before `release.config.json` are treated as stable.

## Release Links

- GitHub releases: https://github.com/buva7687/sql-crack/releases
- VS Code Marketplace management: https://marketplace.visualstudio.com/manage
- Open VSX management: https://open-vsx.org/user-settings/tokens
