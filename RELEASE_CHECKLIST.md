# SQL Crack — Release Checklist

## Prepare the Release

- [ ] Merge the intended release branch into `main` through a reviewed PR.
- [ ] Confirm `package.json` and `package-lock.json` contain the release version.
- [ ] Change the top `CHANGELOG.md` heading to the actual release date.
- [ ] Run `npm run audit:prod`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:perf`, and `npm run package`.
- [ ] Package a local VSIX with `npx @vscode/vsce package --no-dependencies` and inspect its file list.
- [ ] Wait for the required Node 18, Node 20, performance, and build checks on the PR.

## Publish

- [ ] Merge or fast-forward the validated release commit to `main` and push `main`.
- [ ] Do **not** create the version tag or publish to either registry manually.
- [ ] The push to `main` triggers `.github/workflows/release.yml`, which repeats the release gates, creates the GitHub release/tag, and publishes the same VSIX to configured registries.
- [ ] Confirm the GitHub release contains `sql-crack-vX.Y.Z.vsix`.
- [ ] Confirm the version appears on the VS Code Marketplace and Open VSX.

## Resume a Partial Release

If a publication step fails after the tag exists:

1. Open **Actions → Release → Run workflow**.
2. Enter the tagged version without the `v` prefix.
3. Select only the failed target: `github-release`, `vscode-marketplace`, or `open-vsx`.
4. Run the workflow. It checks out the exact version tag, rebuilds and validates that source, and retries only the selected target.

Do not select `full-release` for an existing tag. Targeted Marketplace/Open VSX retries require their corresponding repository secret.

## Release Links

- GitHub releases: https://github.com/buva7687/sql-crack/releases
- VS Code Marketplace management: https://marketplace.visualstudio.com/manage
- Open VSX management: https://open-vsx.org/user-settings/tokens
