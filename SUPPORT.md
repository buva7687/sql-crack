# SQL Crack Support

## Supported releases

The latest stable release is supported on VS Code 1.85 or newer. When a Marketplace pre-release is available, you can opt into it to validate an upcoming release and report regressions.

SQL Crack performs static, best-effort SQL analysis. Vendor-specific syntax may require a selected dialect, a compatibility rewrite, or a partial fallback parse. The UI identifies fallback and incomplete workspace results when detected.

## Environment coverage

CI defines installed-extension smoke tests for Linux, macOS and Windows on VS Code 1.85 and current stable, plus Restricted Mode checks on stable. Local macOS checks passed on VS Code 1.85 and 1.140, including a clean packaged installation and an untrusted workspace on 1.140. An upgrade from the installed 0.9.4 package on macOS (VS Code 1.140) kept its pinned query and panel preferences and rebuilt the workspace index in the new format across a two-folder workspace. Linux and Windows results must pass in CI before the release is approved. Filesystem-backed workspaces are required. Virtual workspaces are unsupported; remote filesystem behavior has a separate acceptance check in the release checklist.

## Saved data and index recovery

Pinned SQL snapshots, panel preferences and the workspace index are stored in VS Code workspace state. Removing a pin with its `×` control deletes that snapshot; closing a visualization panel preserves it. Review snapshots before sharing a workspace's VS Code storage, because they contain SQL text.

Use **Refresh** in the Workspace Dependencies panel to rebuild its index. To bypass a saved index, set `sqlCrack.advanced.cacheTTLHours` to `0`, close the panel and run **SQL Crack: Analyze Workspace Dependencies** again. Restore your preferred TTL after rebuilding. For an expensive scan, cancel it and analyze a smaller folder; the auto-index threshold changes prompting rather than extraction speed.

## Recovering from a release regression

In Extensions, open SQL Crack's gear menu and choose **Install Another Version** to select the previous stable release. You can also download the previous `.vsix` from [GitHub releases](https://github.com/buva7687/sql-crack/releases) and install it with **Extensions → … → Install from VSIX**. Disable automatic updates for SQL Crack while investigating the regression, then re-enable them after a fixed release is available.

Rebuild the workspace index after changing versions. Older releases may not understand newer saved-state formats; keep a copy of any important pinned SQL before downgrading. Include the failing and working versions in your bug report.

## Reporting a problem

Open a [GitHub issue](https://github.com/buva7687/sql-crack/issues) and include:

- SQL Crack and VS Code versions.
- Operating system and selected SQL dialect.
- Reproduction steps and the expected result.
- A minimal, redacted SQL sample when possible.
- Relevant entries from **View → Output → SQL Crack** after enabling debug logging.

Do not post credentials, proprietary SQL, or security-sensitive details in a public issue. Follow [SECURITY.md](SECURITY.md) for private vulnerability reports.
