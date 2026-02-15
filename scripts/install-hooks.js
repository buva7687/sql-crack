#!/usr/bin/env node

/**
 * Install git hooks for the project
 * Runs automatically on `npm install` via the "prepare" script
 */

const fs = require('fs');
const path = require('path');

const hookContent = `#!/bin/bash

# Pre-push hook: Run tests before pushing to remote
# This prevents pushing code that would fail CI

echo "Running pre-push checks..."
echo ""

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Track if any step fails
FAILED=0
TYPECHECK_LOG=$(mktemp -t sqlcrack-typecheck.XXXXXX)
LINT_LOG=$(mktemp -t sqlcrack-lint.XXXXXX)
TEST_LOG=$(mktemp -t sqlcrack-tests.XXXXXX)
cleanup_logs() {
    rm -f "$TYPECHECK_LOG" "$LINT_LOG" "$TEST_LOG"
}
trap cleanup_logs EXIT

# 1. TypeScript type check
echo -e "\${YELLOW}[1/3] Running TypeScript type check...\${NC}"
if npm run typecheck > "$TYPECHECK_LOG" 2>&1; then
    echo -e "\${GREEN}  ✓ Type check passed\${NC}"
else
    echo -e "\${RED}  ✗ Type check failed\${NC}"
    echo "  Last output:"
    tail -n 20 "$TYPECHECK_LOG"
    echo "  Run 'npm run typecheck' to see full output"
    FAILED=1
fi

# 2. Linting
echo -e "\${YELLOW}[2/3] Running linter...\${NC}"
if npm run lint > "$LINT_LOG" 2>&1; then
    echo -e "\${GREEN}  ✓ Lint passed\${NC}"
else
    echo -e "\${RED}  ✗ Lint failed\${NC}"
    echo "  Last output:"
    tail -n 20 "$LINT_LOG"
    echo "  Run 'npm run lint' to see full output"
    FAILED=1
fi

# 3. Tests with coverage
echo -e "\${YELLOW}[3/3] Running tests...\${NC}"
if npm run test:ci > "$TEST_LOG" 2>&1; then
    echo -e "\${GREEN}  ✓ Tests passed\${NC}"
else
    echo -e "\${RED}  ✗ Tests failed (or coverage threshold not met)\${NC}"
    echo "  Last output:"
    tail -n 20 "$TEST_LOG"
    echo "  Run 'npm run test:ci' to see full output"
    FAILED=1
fi

echo ""

if [ $FAILED -eq 1 ]; then
    echo -e "\${RED}Pre-push checks failed. Push aborted.\${NC}"
    echo "Fix the issues above and try again."
    echo ""
    echo "To skip this check (not recommended): git push --no-verify"
    exit 1
else
    echo -e "\${GREEN}All pre-push checks passed!\${NC}"
    exit 0
fi
`;

const gitDir = path.join(__dirname, '..', '.git');
const hooksDir = path.join(gitDir, 'hooks');
const prePushPath = path.join(hooksDir, 'pre-push');

// Check if .git directory exists (might not in CI or when installed as dependency)
if (!fs.existsSync(gitDir)) {
    console.log('No .git directory found, skipping hook installation');
    process.exit(0);
}

// Create hooks directory if it doesn't exist
if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
}

// Write the pre-push hook
fs.writeFileSync(prePushPath, hookContent, { mode: 0o755 });
console.log('Git pre-push hook installed successfully');
