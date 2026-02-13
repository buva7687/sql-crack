# SQL Crack - VS Code Extension for SQL Visualization

## Project Overview
A VS Code extension that provides interactive SQL flow visualization, workspace dependency graphs, and column lineage tracing. Built with TypeScript, packaged as a VSIX.

## Architecture

### Two Webview Panels
1. **SQL Flow** (`src/webview/`) — Per-file SQL query visualization with node graphs, stats, hints
2. **Workspace Dependencies** (`src/workspace/`) — Cross-file dependency graph, lineage, tables, impact views

### Key File Map

**Shared:**
- `src/shared/theme.ts` — Theme color definitions, `getReferenceTypeColor()`, `getWorkspaceNodeColor()`
- `src/shared/index.ts` — Re-exports from shared modules
- `src/shared/icons.ts` — SVG icon constants

**SQL Flow Webview (`src/webview/`):**
- `renderer.ts` — Main rendering engine (large file: node rendering, zoom/pan, fullscreen, theme, stats panels)
- `sqlParser.ts` — SQL parsing with dialect support
- `index.ts` — Entry point, message handling, parse orchestration
- `ui/toolbar.ts` — Toolbar buttons, search, overflow menu, error badge, keyboard shortcuts modal
- `ui/breadcrumbBar.ts` — Filter/state indicator chips below toolbar
- `ui/exportDropdown.ts` — PNG/SVG/DOT export dropdown
- `ui/layoutPicker.ts` — Graph layout algorithm picker
- `ui/legendBar.ts` — Edge type legend
- `ui/batchTabs.ts` — Multi-query tab bar
- `constants/colors.ts` — `COMPONENT_UI_COLORS`, `getComponentUiColors()` for themed UI tokens

**Workspace Panel (`src/workspace/`):**
- `workspacePanel.ts` — Main panel class, graph rendering, SVG export, theme management
- `handlers/messageHandler.ts` — `MessageHandlerContext` interface, command routing
- `ui/sharedStyles.ts` — ALL CSS styles (variables, base, graph, lineage, tables, impact views)
- `ui/clientScripts.ts` — Client-side JS (navigation, zoom/pan, minimap, theme hot-swap)
- `ui/lineageGraphRenderer.ts` — SVG node rendering for lineage graphs
- `ui/lineageView.ts` — Lineage view HTML generation
- `dependencyGraph.ts` — DAG layout algorithm

### Theming System
- **Workspace panel**: CSS variables in `:root` via `getCssVariables(dark)` in `sharedStyles.ts`
  - Dark: `--text-primary: #f1f5f9`, `--node-text: #f1f5f9`, `--bg-primary: #111111`
  - Light: `--text-primary: #0f172a`, `--node-text: #1e293b`, `--bg-primary: #fafafa`
  - Theme hot-swap via `themeChanged` message (no full HTML rebuild)
- **SQL Flow webview**: Inline styles using `getComponentUiColors(isDark)` from `constants/colors.ts`
  - Returns `{ surface, text, textBright, textMuted, border, accent, ... }` for current theme

### Common Bug Patterns
- **Hardcoded dark-only colors**: `rgba(255,255,255,...)`, `fill: white`, `color: #f1f5f9` outside CSS variables — invisible on light theme
- **Fullscreen mode forgetting elements**: `toggleFullscreen()` in renderer.ts has separate hide/restore lists that must stay in sync
- **Navigation state leaks**: `_currentView` on server must match client-side view after `switchToView()`

## Commands
- `npx tsc --noEmit` — Type check
- `npx jest --silent` — Run all tests
- `npx jest path/to/test` — Run specific test
- `vsce package` — Build VSIX

## Conventions
- Commit messages: `fix(scope): description` or `feat(scope): description`
- Always run `tsc --noEmit` and `jest` before committing
- When fixing UI/UX issues, grep for related hardcoded values across the entire codebase before marking done
- SVG elements use `fill`/`stroke` attributes; CSS can override these with higher specificity

## Lessons Learned

### Type System & Validation Workflow
1. **Always validate before claiming complete:**
   - Run `npx tsc --noEmit` → Must pass with 0 errors
   - Run `npx jest --silent` → All tests must pass
   - Never assume code works without running these commands
   - Never delete test files without running them first

2. **Type system constraints:**
   - Use `SqlDialect` union type from `src/webview/types/parser.ts` - NOT string literals
     - ✅ Correct: `'PostgreSQL' as SqlDialect`
     - ❌ Wrong: `'postgresql'`
   - `tableCategory` only supports: `'physical' | 'derived' | 'cte_reference' | 'table_function'`
     - Adding new categories requires updating `src/webview/types/nodes.ts`
   - `ColumnLineage` interface has specific fields - check `src/webview/types/lineage.ts` before using

3. **Registry vs Parser layer separation:**
   - **Registry layer** (data): Adding functions to `functions.json` and `functionRegistry.ts`
     - This is just data - it doesn't make the parser use it
   - **Parser layer** (logic): Updating `sqlParser.ts` to detect and handle those functions
     - This is implementation - requires AST traversal, node creation, graph updates
   - **Lesson:** Registry complete ≠ Implementation complete
     - Example: Table-valued functions (TVFs) can be in registry but not parsed

4. **Test-first workflow:**
   - Create ONE test → Run it → Fix errors → Verify it passes
   - Don't write 30+ tests without running any of them
   - Don't claim "tests passing" for tests that were deleted
   - If tests rely on unimplemented features, mark them as TODO or skip them

5. **Common pitfalls to avoid:**
   - Assuming TypeScript types without checking the actual definitions
   - Confusing "added to data" with "implemented in parser"
   - Writing status reports before running `npm test`
   - Removing failing tests instead of either fixing them OR clearly marking them as pending
   - **Regex false positives:** Be careful with dialect detection regex patterns
     - Example: `:\w+` matches Snowflake path operator BUT ALSO PostgreSQL `::` cast and MySQL `:param` bind parameters
     - Use negative lookbehind/lookahead or more specific patterns: `/(?<!:):\w+(?!:)/` instead of `/:\w+/`
   - **Cross-dialect syntax:** Some keywords exist in multiple dialects
     - Example: `UNNEST` is valid in BigQuery, PostgreSQL, AND Trino - not just BigQuery
     - Always check if syntax is dialect-specific before showing warnings
   - Claiming "complete" when only the foundation is done

6. **SQL comment stripping:**
   - Any function that regex-matches against raw SQL **must** strip comments first
   - `-- line comments` and `/* block comments */` contain SQL keywords that cause false matches
   - Example: `-- JOIN Patterns` matched `/\bJOIN\s+(\w+)/gi` and extracted "Patterns" as a table name
   - Use: `sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')` before regex extraction
   - Affected: `regexFallbackParse()`, `extractQueryLabel()` — any new regex-on-SQL function needs this too

7. **Renderer state leaks on early returns:**
   - `render()` in `renderer.ts` has early-return paths for error/empty results (lines ~1493, ~1509)
   - These paths must clear **all** mutable state (column lineage, column flows, etc.)
   - Otherwise pressing feature keys (like "C" for column lineage) shows stale data from the previous query
   - When adding new state to the renderer, audit all early-return paths in `render()`

8. **Webview settings wiring pattern:**
   - New settings flow: `package.json` → `visualizationPanel.ts` (read config + inject into HTML) → `Window` interface in `index.ts` → consumed at init
   - Always add the `window.*` property to the `Window` interface declaration in `index.ts`
   - For refresh-time settings, also thread through the `refresh()` message options

9. **Security — no inline event handlers in generated HTML:**
   - Never use `onclick="..."` in dynamically generated HTML (especially with user-derived data like file paths)
   - Use `data-*` attributes + `addEventListener` with event delegation instead
   - Example: `<div data-filepath="${escapeHtmlSafe(path)}" class="clickable">` + delegated click listener
   - Any text injected via `innerHTML` from user-derived content must go through `escapeHtml()` first
   - For tooltips using `innerHTML`, strip `<script>` tags and `on*` event attributes at minimum

10. **Cross-platform path handling:**
    - Never use `fileName.split('/').pop()` — it breaks on Windows (backslash paths)
    - Always use `path.basename(fileName)` from Node's `path` module
    - The `workspace/ui/` files (clientScripts, impactView, tableExplorer) also use `split('/').pop()` but in client-side contexts where paths come from the extension host (already normalized)

11. **Webview initialization guard:**
    - Always check `document.readyState` before adding a `DOMContentLoaded` listener
    - In cached webviews (e.g., `retainContextWhenHidden`), the DOM may already be loaded when the script runs
    - Pattern: `if (document.readyState === 'loading') { addEventListener('DOMContentLoaded', setup); } else { setup(); }`

12. **Async queue processing resilience:**
    - When processing a queue of file updates, wrap each iteration in try/catch
    - One bad file should not skip all remaining files
    - Check file existence (`fs.stat`) before processing — files may be deleted while queued
    - Call `removeFile()` to clean up index entries for deleted files

13. **SQL preprocessing transforms (CTE hoisting):**
    - `hoistNestedCtes()` rewrites `FROM ( WITH ... SELECT ... )` to top-level CTEs before parsing
    - Uses balanced-paren tracking (not regex) for CTE body extraction — CTE bodies can contain nested subqueries
    - Must mask string literals and comments before pattern matching to avoid false positives
    - When merging with existing top-level CTEs, must both remove the nested WITH AND insert it at the top
    - Iterative application (loop) handles multiple independent nested CTEs in one query

14. **SQL preprocessing transforms (PostgreSQL syntax):**
    - `preprocessPostgresSyntax()` strips `AT TIME ZONE` and type-prefixed literals (`timestamptz '...'`, etc.) before parsing
    - **Masked vs original SQL pitfall:** `maskStringsAndComments()` replaces string contents AND quotes with spaces — so `\s+` in a regex on the masked string will eat through where a string literal was, consuming tokens on the other side (e.g., `FROM` keyword after `'America/Chicago'`)
    - **Fix:** Match keywords in the masked string, but skip whitespace and find arguments in the **original** SQL
    - **Lookahead on masked strings doesn't work:** `(?=')` fails because quotes are masked to spaces — instead, match the keyword with `\b` boundary, then manually check the original SQL at that position for a quote
    - Same pattern as `hoistNestedCtes`: preprocess before `parser.astify()`, preserve original SQL for display, add info hint when rewriting occurs
