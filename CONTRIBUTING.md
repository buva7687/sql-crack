# Contributing to SQL Crack

Thank you for your interest in contributing. Here’s how to get started.

## Development setup

1. **Fork and clone** the repo:
   ```bash
   git clone https://github.com/buva7687/sql-crack.git
   cd sql-crack
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build**:
   ```bash
   npm run compile
   ```

4. **Run the extension** in VS Code:
   - Open the repo in VS Code, press `F5` or use **Run > Start Debugging** to launch the Extension Development Host with the extension loaded.

## Making changes

1. **Create a branch** from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and ensure:
   - `npm install` has been run (required before any build/test commands).
   - `npx tsc --noEmit` passes with zero errors.
   - `npm run test` passes. Run `npm run test:perf` separately for the performance gates.
   - `npm run compile` succeeds.
   - `npm run lint` passes.

3. **Commit** with a clear message (e.g. `feat: Add X`, `fix: Y`).

4. **Push** and open a **Pull Request** against `main`.

## Reporting issues

- Use [GitHub Issues](https://github.com/buva7687/sql-crack/issues).
- Include: VS Code version, extension version, steps to reproduce, and a sample SQL query when relevant.

## Code and PRs

- Keep PRs focused; link related issues.
- Follow existing code style and patterns in the project.

Thanks for contributing.

When changing bundled runtime dependencies, regenerate license notices with `npm run package -- --json=webpack-stats.json` followed by `npm run notices`. Commit the updated `THIRD_PARTY_NOTICES.txt`; CI checks that it matches the production bundle. Use `npm run test:extension-host` to test the real desktop extension (set `VSCODE_TEST_VERSION=1.85.0` for the minimum supported release). These tests use a temporary workspace and profile.

Set `VSCODE_TEST_VSIX` to a packaged `.vsix` path to run those checks against a clean installation instead of the development checkout. CI uses this mode so missing assets and worker bundles fail the platform smoke tests.

Set `VSCODE_TEST_RESTRICTED=1` with a packaged VSIX to test an untrusted temporary workspace. This mode asserts that Restricted Mode is active before checking SQL Crack activation and visualization.

Run checks locally and batch fixes before pushing. Routine CI runs Node 20/22 tests, coverage on Node 22, dependency auditing, performance gates, packaging and Linux/stable installed smoke tests. Superseded runs are cancelled. Marking a draft PR ready for review runs the full Linux/macOS/Windows matrix against VS Code 1.85 and stable. After later changes, request a fresh full matrix with **Actions → Tests → Run workflow**, select the candidate branch and leave **full_matrix** checked. The manual option becomes available after this workflow is merged into the default branch. All smoke tests install the same VSIX built once by the build job.
