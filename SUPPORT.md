# SQL Crack Support

## Supported releases

The latest stable release and the current Marketplace pre-release candidate are supported on VS Code 1.85 or newer. Install the stable build for normal use; opt into the pre-release build to validate an upcoming release and report regressions.

SQL Crack performs static, best-effort SQL analysis. Vendor-specific syntax may require a selected dialect, a compatibility rewrite, or a partial fallback parse. The UI identifies fallback and incomplete workspace results when detected.

## Reporting a problem

Open a [GitHub issue](https://github.com/buva7687/sql-crack/issues) and include:

- SQL Crack and VS Code versions.
- Operating system and selected SQL dialect.
- Reproduction steps and the expected result.
- A minimal, redacted SQL sample when possible.
- Relevant entries from **View → Output → SQL Crack** after enabling debug logging.

Do not post credentials, proprietary SQL, or security-sensitive details in a public issue. Follow [SECURITY.md](SECURITY.md) for private vulnerability reports.
