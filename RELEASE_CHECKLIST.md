# SQL Crack — Release Checklist

## Prepare the Release

- [ ] Open a reviewed PR from the intended release branch into `main`.
- [ ] Confirm `package.json` and `package-lock.json` contain the release version.
- [ ] Confirm `release.config.json` uses `pre-release` for a candidate or `stable` for a normal release.
- [ ] Date the versioned `CHANGELOG.md` heading on the intended publication day.
- [ ] Run `node scripts/validateReleaseChangelog.js <version>` after setting the date and before merging; a push to `main` starts publication.
- [ ] Run `npm run audit:prod`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:perf`, and `npm run package`.
- [ ] Package a local VSIX with `npx @vscode/vsce@3.9.2 package --no-dependencies` (add `--pre-release` for a candidate) and inspect its file list.
- [ ] Wait for Node 20/22, performance, packaging, and Linux/macOS/Windows extension-host checks on the PR.
- [ ] Run the extension-host smoke test against VS Code 1.85 and stable.
- [ ] Manually verify keyboard-only navigation, high contrast, exports, and a clean install/update from the previous stable extension.
- [ ] Confirm bundled walkthrough assets and THIRD_PARTY_NOTICES.txt are in the VSIX.
- [ ] Run the full dependency audit (`npm run audit:all`) and investigate new advisories; CI and the release build also enforce this gate.
- [ ] Exercise Restricted Mode, a remote filesystem workspace and multi-root workspace indexing; virtual workspaces are unsupported.
- [ ] Verify saved pins, cache-version migration, custom aggregate/window settings and duplicate-column selection after refresh.

## Publish

- [ ] Merge or fast-forward the validated release commit to `main` and push `main`.
- [ ] Do **not** create the version tag or publish to either registry manually.
- [ ] The push to `main` triggers `.github/workflows/release.yml`, which repeats the release gates, creates the GitHub release/tag, and publishes the same VSIX to configured registries.
- [ ] Confirm the GitHub release contains `sql-crack-vX.Y.Z.vsix`.
- [ ] Confirm the version appears on the VS Code Marketplace and Open VSX.

## Stable Release

- Set the intended release version in both package files and keep `release.config.json` set to `stable`. The workflow publishes the GitHub, Marketplace, and Open VSX artifacts as stable releases.
- Confirm both a clean install and an update from the previous stable extension before publication.

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
