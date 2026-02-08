# SQL Crack — Product Roadmap V2

**Created:** 2026-02-07
**Branch:** workspace_rewrite
**Status:** Living document — update as items are completed
**Predecessor:** PRODUCT_ROADMAP.md (9 items, all complete/verified)

---

## Priority Legend
- **P1** — High impact, users will hit this and get frustrated
- **P2** — Medium impact, polish that builds trust
- **P3** — Low impact, nice to have

---

## 1. Regex-Based Partial Parser Fallback [P1]

**Problem:** When `node-sql-parser` fails, users see an empty screen with an error message. This is the #1 user friction point. Many valid SQL queries fail parsing due to dialect quirks, unsupported syntax, or edge cases. Showing nothing is worse than showing a best-effort approximation.

**Scope:**
- Build a regex-based fallback that extracts tables, columns, JOINs, and basic structure from raw SQL
- Kick in automatically when AST parsing fails
- Show a "partial visualization" with a clear "best effort" banner
- Extract: FROM/JOIN table names, SELECT column names, WHERE clause existence, subquery boundaries
- Handle common patterns: CTE names, INSERT targets, UPDATE targets, DELETE targets

**Approach:**
- Regex patterns for: `FROM\s+(\w+)`, `JOIN\s+(\w+)`, `INTO\s+(\w+)`, `UPDATE\s+(\w+)`, `SELECT\s+(.+?)\s+FROM`
- Build minimal nodes (tables) and edges (joins) from extracted data
- Mark result with `partial: true` flag so UI can show "approximate" indicator
- Don't try to be perfect — 70% accuracy is infinitely better than 0%

**Files:**
- `src/webview/sqlParser.ts` — new `regexFallbackParse()` function, called from catch block
- `src/webview/renderer.ts` — "Partial visualization" banner/badge
- `src/webview/types/parser.ts` — add `partial?: boolean` to ParseResult

**Tests:**
- MERGE INTO statement → shows source and target tables
- Snowflake-specific syntax on MySQL dialect → shows tables from FROM/JOIN
- Completely mangled SQL → shows whatever tables can be extracted
- Valid SQL still uses AST parser (fallback not triggered)

**Status:** [x] Complete (2026-02-07)

**Implementation:**
- Added `regexFallbackParse()` that extracts tables from FROM/JOIN/INTO/UPDATE/MERGE/USING clauses
- CTE detection with `cte_reference` category
- JOIN edge creation between detected tables
- MERGE-specific dialect hints (ON CONFLICT for PG, ON DUPLICATE KEY for MySQL)
- Stats calculation (tables, joins, CTEs, aggregates via regex)
- `partial: true` flag on results, dialect hints merged into fallback
- 30 tests covering basic fallback, MERGE, CTEs, JOINs, stats, edge cases, multi-dialect
- All 899 tests passing

---

## 2. File Size and Statement Limit Handling [P1]

**Problem:** Hard limits of 100KB and 50 statements reject entire files with no partial result. Real migration scripts, ETL dumps, and batch operations routinely exceed these. Users get a cryptic validation error and an empty screen.

**Scope:**
- Parse up to the limit instead of rejecting entirely
- Show first N statements with a "showing 50 of 127 statements" indicator
- For oversized files, parse the first 100KB and indicate truncation
- Add a user-facing message explaining the limit and how to work around it
- Consider making limits configurable via VS Code settings

**Files:**
- `src/webview/sqlParser.ts` — `validateInput()` and batch parsing logic
- `src/webview/index.ts` — truncation indicator in UI
- `package.json` — optional VS Code settings for configurable limits

**Tests:**
- 60-statement file → shows first 50 with truncation indicator
- 150KB file → parses first 100KB, shows truncation
- File within limits → no change in behavior

**Status:** [x] Complete (2026-02-07)

**Implementation:**
- Size limit: parses first 100KB with truncation warning instead of rejecting
- Statement limit: parses first N statements with "showing X of Y" warning
- `validationError` still set so callers know limits were hit
- `formatBytes()` helper for human-readable size display
- 14 tests covering size limits, statement limits, combined limits, edge cases
- All 899 tests passing

---

## 3. MERGE Statement Visualization [P1]

**Problem:** MERGE is a core ETL pattern but `node-sql-parser` can't parse it in most dialects. Item #3 from V1 landed detection and hints, but users still can't see the data flow. With the partial parser from Item #1, we can visualize MERGE using regex extraction.

**Scope:**
- Extract MERGE components via regex: target table, source table/subquery, ON condition
- Extract WHEN MATCHED/NOT MATCHED branches
- Visualize as: Source → MERGE node → Target (with branch details)
- Leverage partial parser infrastructure from Item #1

**Depends on:** Item #1 (partial parser fallback)

**Files:**
- `src/webview/sqlParser.ts` — `parseMergeStatement()` regex parser
- `src/webview/types/nodes.ts` — optional `merge` node type or reuse existing

**Tests:**
- Standard MERGE with MATCHED/NOT MATCHED → shows source, target, branches
- MERGE with subquery source → shows subquery tables
- MERGE with CTE → shows CTE and target

**Status:** [x] Complete (2026-02-08)

**Implementation:**
- Enhanced `regexFallbackParse()` with dedicated MERGE visualization
- Extracts WHEN MATCHED/NOT MATCHED clauses with actions (UPDATE, INSERT, DELETE)
- Creates MERGE node with `operationType: 'MERGE'`, `accessMode: 'write'`
- Connects source→MERGE→target with `merge_source`/`merge_target` edge types
- Handles conditional MATCHED, NOT MATCHED BY TARGET/SOURCE variants
- Added `merge_source` and `merge_target` to `clauseType` union in `FlowEdge`
- 17 tests covering standard MERGE, complex sources, multiple WHEN clauses, edge cases, dialect hints
- All 916 tests passing

---

## 4. Parser Timeout Protection [P2]

**Problem:** Parser runs synchronously with no timeout. A pathologically complex query (deeply nested subqueries, hundreds of JOINs) can freeze the webview indefinitely. Users have no way to cancel or recover without reloading.

**Scope:**
- Add a configurable timeout (default 5 seconds) for parsing
- If timeout exceeded, abort and show "Query too complex to visualize" with the raw SQL
- Consider using Web Workers for parsing to avoid blocking the UI thread
- Show a progress/spinner during parsing for large queries

**Approach:**
- Option A: Wrap parser in `setTimeout` with abort signal (simpler)
- Option B: Move parser to Web Worker (better UX, more complex)
- Start with Option A, consider Option B later

**Files:**
- `src/webview/sqlParser.ts` — timeout wrapper around `parser.astify()`
- `src/webview/index.ts` — loading state during parsing

**Tests:**
- Normal query parses within timeout
- Simulated slow parse triggers timeout message

**Status:** [x] Complete (2026-02-08)

**Implementation:**
- Measures parse duration with `Date.now()` around `parser.astify()`
- Warns at 70%+ of timeout threshold (medium severity)
- Falls back to regex parser when timeout exceeded, merging timeout hint into result
- Exported `PARSE_TIMEOUT_MS` (5s default) and `setParseTimeout()` for configurability/testing
- 15 tests using `jest.spyOn(Date, 'now')` to deterministically simulate slow parsing
- All 993 tests passing

---

## 5. Expand TVF Registry [P2]

**Problem:** The table-valued function registry infrastructure was added in V1, but many common TVFs are missing. Unregistered TVFs won't be detected as data sources and will render as plain table references or be silently skipped.

**Scope:**
- Add missing PostgreSQL TVFs: `generate_series`, `generate_subscripts`, `jsonb_to_recordset`, `jsonb_array_elements`, `json_populate_recordset`, `regexp_split_to_table`
- Add missing BigQuery TVFs: `json_extract_array`, `json_extract_string_array`
- Add missing Snowflake TVFs: `strtok_split_to_table`
- Add missing T-SQL TVFs: `string_split` (already there), `generate_series` (SQL Server 2022+)
- Verify detection works for each added TVF with a test

**Files:**
- `src/dialects/functions.json` — add TVFs to dialect arrays
- `tests/unit/dialects/functionRegistry.test.ts` — verify new entries

**Tests:**
- Each new TVF is returned by `getTableValuedFunctions(dialect)`
- `isTableValuedFunction(name, dialect)` returns true for each

**Status:** [x] Complete (2026-02-08)

**Implementation:**
- Added PostgreSQL: `JSON_POPULATE_RECORDSET`, `JSON_TO_RECORDSET`, `JSONB_TO_RECORDSET`, `JSONB_POPULATE_RECORDSET`
- Added Snowflake: `STRTOK_SPLIT_TO_TABLE`
- Added BigQuery: `JSON_EXTRACT_ARRAY`, `JSON_EXTRACT_STRING_ARRAY`
- 37 tests covering detection, cross-dialect isolation, case sensitivity, completeness
- All 993 tests passing

---

## 6. Fullscreen Element List Consolidation [P2]

**Problem:** `renderer.ts` has two manually synced arrays listing UI elements to hide/show during fullscreen toggle. Every new UI element risks breaking fullscreen mode. This is a maintenance trap with no test coverage.

**Scope:**
- Extract the element list into a single source of truth (array or data attribute)
- Use `querySelectorAll('[data-fullscreen-hide]')` or similar pattern
- Add a test that validates all hideable elements are properly restored

**Files:**
- `src/webview/renderer.ts` — `toggleFullscreen()` function

**Tests:**
- All elements with fullscreen-hide attribute are hidden in fullscreen
- All elements are restored when exiting fullscreen
- New elements with the attribute are automatically handled

**Status:** [x] Complete (2026-02-08)

**Implementation:**
- Extracted `FULLSCREEN_HIDE_IDS` and `FULLSCREEN_HIDE_SELECTORS` into `src/webview/constants/fullscreen.ts`
- `toggleFullscreen()` builds element list from these constants + `columnLineageBanner` + `[data-fullscreen-hide]` query
- Fixed bug: `columnLineageBanner` was dropped from hide list during original refactor
- 25 tests verifying all IDs/selectors present, no duplicates, completeness checks
- All 993 tests passing

---

## 7. Light Theme Color Audit [P3]

**Problem:** Scattered `rgba(255,255,255,...)` values bypass the theme system. Some SVG elements use hardcoded colors that are invisible or low-contrast on light backgrounds. Not broken, but not polished.

**Scope:**
- Grep for hardcoded `rgba(255,255,255`, `fill: white`, `color: #f1f5f9` outside CSS variables
- Replace with theme-aware alternatives using `isDark` ternary or CSS variables
- Focus on renderer.ts SVG rendering (node borders, edge labels, grid lines)
- Test both dark and light themes visually

**Files:**
- `src/webview/renderer.ts` — SVG node/edge rendering
- `src/webview/constants/colors.ts` — add missing light theme variants if needed

**Status:** [x] Complete (2026-02-08)

**Implementation:**
- Fixed `renderer.ts:1814` — node border stroke now uses `isDark` ternary instead of hardcoded white
- Fixed `toolbar.ts` — `btnStyle` converted to `getBtnStyle(dark)` function, title/search box initial render now theme-aware
- Fixed all dropdown items (focus mode, view location, pinned tabs) — text colors now use `isDark` ternary
- Fixed `pinnedTabs.ts` — added `isDarkTheme?` to callback interface, active tab color is theme-aware
- Fixed `createSearchBox` — background and text colors are now theme-aware
- Audited `color: white` and `fill="white"` — confirmed these are all on colored backgrounds (badges, toasts, node headers) and correct in both themes
- All 1004 tests passing

---

## 8. Workspace Panel Error Messages [P3]

**Problem:** Workspace panel shows generic errors like "No index available" and "Table not found" with no actionable context. Users can't tell if the problem is a missing file scan, a schema issue, or a bug.

**Scope:**
- Add context to error messages: what was attempted, what failed, what to try
- For "table not found": suggest similar table names (fuzzy match), check if file was scanned
- For "no index available": explain that files need to be scanned first, show refresh button
- Add "last scanned" timestamp to workspace panel header

**Files:**
- `src/workspace/workspacePanel.ts` — error message generation
- `src/workspace/handlers/messageHandler.ts` — error context propagation

**Status:** [x] Complete (2026-02-08)

**Implementation:**
- Added `findSimilarTableNames()` with Levenshtein distance fuzzy matching to `messageHandler.ts`
- "Table not found" now suggests similar table names (up to 3) or provides actionable guidance
- "No lineage graph available" now explains how to build the graph (open SQL files + Refresh)
- "No index available" now shows detailed explanation and displays index status (last scanned time)
- `getErrorHtml()` accepts optional `detail` parameter and shows last-scanned timestamp
- "Index not ready" tooltip improved with actionable instructions
- 11 tests covering fuzzy matching: substring, edit distance, typos, case, limits, column exclusion
- All 1004 tests passing

---

## Completion Tracking

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Regex-based partial parser fallback | P1 | Done |
| 2 | File size and statement limit handling | P1 | Done |
| 3 | MERGE statement visualization | P1 | Done |
| 4 | Parser timeout protection | P2 | Done |
| 5 | Expand TVF registry | P2 | Done |
| 6 | Fullscreen element list consolidation | P2 | Done |
| 7 | Light theme color audit | P3 | Done |
| 8 | Workspace panel error messages | P3 | Done |
