# Security

## Reporting a vulnerability

Report security issues privately through [GitHub private vulnerability reporting](https://github.com/buva7687/sql-crack/security/advisories/new). Include the affected version, reproduction steps, and likely impact. Avoid public issues for security-sensitive reports. Maintainers will coordinate disclosure after investigating and preparing a fix.

## Scope

This extension runs in the VS Code environment and parses SQL you provide. It does not send your code to external servers. Parsing is done locally (e.g. via node-sql-parser in the webview/extension host). Please report any behavior that could lead to data exposure, privilege escalation, or denial of service in that context.

Thank you for helping keep SQL Crack safe.
