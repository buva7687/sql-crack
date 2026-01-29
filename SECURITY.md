# Security

## Reporting a vulnerability

If you believe you’ve found a security vulnerability, please report it responsibly:

- **Do not** open a public GitHub issue for security-sensitive bugs.
- **Email** the maintainers (e.g. via the repository owner’s GitHub profile or the contact listed in the VS Code extension publisher page) with:
  - A short description of the issue.
  - Steps to reproduce (if possible).
  - Impact and suggested fix (if you have one).

We’ll acknowledge receipt and work with you to understand and address the issue. We may coordinate disclosure after a fix is available.

## Scope

This extension runs in the VS Code environment and parses SQL you provide. It does not send your code to external servers. Parsing is done locally (e.g. via node-sql-parser in the webview/extension host). Please report any behavior that could lead to data exposure, privilege escalation, or denial of service in that context.

Thank you for helping keep SQL Crack safe.
