# SQL Crack Smoke Checklist

Use this checklist before release or after UI/icon/compare-mode changes.

## Scope
- Extension command icon rendering (VS Code + Cursor)
- SQL visualize flow basic health
- Compare mode open/close/render behavior
- Theme switching while compare mode is active
- Basic build/test sanity

## Environment
- Workspace: `sql-crack`
- Date:
- Tester:
- Branch/commit:
- VS Code version:
- Cursor version:

## Automated Smoke (Terminal)
Run from repo root:

```bash
npm run typecheck
npm run lint
npm test -- tests/unit/webview/ui/compareView.test.ts
npm test -- tests/unit/webview/compareModeWiring.test.ts
npm test -- tests/unit/review3-phase3-polish.test.ts
npm run package
```

Pass criteria:
- All commands exit `0`
- `npm run package` builds both `extension.js` and `webview.js`

## Manual Smoke (VS Code + Cursor)

### 1) Command Icon Rendering
1. Open any `.sql` file.
2. Verify editor title bar shows `SQL Crack: Visualize SQL Query` icon.
3. Run this in both VS Code and Cursor.

Pass criteria:
- Icon is visible in both editors.
- Icon shape is consistent in light and dark themes.

### 2) Basic Visualize Flow
1. Run command: `SQL Crack: Visualize SQL Query`.
2. Confirm webview opens without errors.
3. Confirm graph nodes/edges render.
4. Toggle legend (`L`) and open shortcuts (`?`).

Pass criteria:
- No blank panel/crash.
- Controls respond.

### 3) Compare Mode
1. Open a SQL with at least two statements or pin another query as baseline.
2. Enable compare mode.
3. Confirm two-pane layout appears.
4. Confirm highlighted states appear (added/removed/changed as applicable).
5. Press `Esc` and confirm compare overlay closes.

Pass criteria:
- Overlay opens and closes correctly.
- No broken layout or frozen interactions.

### 4) Theme Re-render While Compare Is Open
1. Open compare mode.
2. Toggle theme from toolbar.
3. Verify compare UI re-renders (header, panels, borders, text) correctly.

Pass criteria:
- No stale colors/mixed theme artifacts.
- Overlay remains interactive.

### 5) First-run Overlay / Icon Consistency
1. Trigger first-run onboarding in a fresh state/profile if available.
2. Confirm tip icons render as SVG-style icons (not platform emoji glyphs).

Pass criteria:
- Icons are monochrome/styled consistently with UI.

## Regression Checks (Quick File Inspection)
- `assets/sql-flow-sc-light.svg` contains no `<text>`
- `assets/sql-flow-sc-dark.svg` contains no `<text>`
- `src/shared/zIndex.ts` exists and is used by updated UI modules
- No legacy emoji glyphs in phase-3 hotspot files

## Result Summary
- Overall status: `PASS` / `FAIL`
- Failing step(s):
- Notes:
- Follow-up issues created:
