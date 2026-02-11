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
   - `npx jest --silent` passes — all tests green.
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
