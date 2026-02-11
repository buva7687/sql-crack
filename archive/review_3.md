# SQL Crack — Consolidated Action Plan

> Synthesized from three independent reviews (Feb 10, 2026).
> Reorganized by priority: security and bugs first, then polish, then features.
> Phase 3 (Architecture — splitting large files) is deferred and tracked separately.

---

## Phase 1: Security & Critical Bugs (< 1 day)

These must be fixed before any polish work. Security issues and bugs that break functionality.

### 1.1 XSS in workspace inline `onclick` handler

**Severity:** HIGH — security fix

**Problem:** In `clientScripts.ts` (~line 1765), the workspace lineage view builds inline `onclick` handlers with `n.filePath` only escaped for single quotes:

```javascript
onclick="vscode.postMessage({command:'openFileAtLine', filePath:'"
    + (n.filePath || '').replace(/'/g, "\\'") + "', line: " + (n.lineNumber || 0) + "})"
```

File paths containing `"`, `\`, or `>` can break out of the attribute and inject script.

**Fix:** Replace inline `onclick` with `addEventListener` using `data-*` attributes:

```html
<!-- Instead of inline onclick: -->
<div data-filepath="<escaped>" data-line="<number>" class="lineage-clickable">

<!-- Then in JS: -->
document.addEventListener('click', (e) => {
    const target = e.target.closest('.lineage-clickable');
    if (target) {
        vscode.postMessage({
            command: 'openFileAtLine',
            filePath: target.dataset.filepath,
            line: parseInt(target.dataset.line, 10)
        });
    }
});
```

**Effort:** 15 min

---

### 1.2 Tooltip `innerHTML` from `atob()` — sanitize or use `textContent`

**Severity:** HIGH — security fix

**Problem:** In `clientScripts.ts` (~line 2257), `showTooltip()` does:

```javascript
tooltip.innerHTML = content;
```

where `content` comes from `atob(element.getAttribute('data-tooltip'))`. If tooltip data contains HTML tags, it will be parsed and rendered.

**Fix:** Use `textContent` for plain-text tooltips:

```javascript
// Option A — plain text (safest):
tooltip.textContent = content;

// Option B — if HTML formatting is needed:
tooltip.innerHTML = escapeHtmlSafe(content);
```

**Effort:** 10 min

---

### 1.3 Escape `extractQueryLabel` output in batchTabs

**Severity:** Medium — XSS hardening

**Problem:** `batchTabs.ts:159` injects `extractQueryLabel()` output (regex-extracted table names from user SQL) directly via `innerHTML`. Theoretical XSS if a table name contains HTML.

**Action:** Use `textContent` for the label portion, or apply `escapeHtml()` to the label:
```typescript
// Instead of innerHTML with raw label:
tab.innerHTML = `<span style="...">${stateIcon}</span> ${escapeHtml(extractQueryLabel(query.sql, i))}`;
```

**Effort:** 15 min

---

### 1.4 Harden inline onclick escaping in clientScripts.ts

**Severity:** Medium — XSS hardening

**Problem:** Line 1765 builds an inline `onclick` handler with `.replace(/'/g, "\\'")` — doesn't handle backslashes or other special chars in file paths.

**Action:** Switch to data-attribute + event delegation:
```typescript
html += `<div data-filepath="${escapeHtmlAttr(n.filePath || '')}" data-line="${n.lineNumber || 0}" class="clickable-node" style="...">`;
// Then add a single delegated listener on the container
```

**Effort:** 30 min

---

### 1.5 Fix Windows path handling — `split('/')` → `path.basename()`

**Severity:** HIGH — broken on Windows

**Problem:** Several places in `extension.ts` use `document.fileName.split('/').pop()` to extract the filename. On Windows, paths use backslashes, so `split('/')` returns the full path as a single element. Tab titles and panel headers show the full Windows path.

**Locations to fix (extension.ts):**
- Line ~213: file label for visualize command
- Line ~229: file label for refresh command
- Line ~414: file label in auto-refresh handler

**Fix:**
```typescript
import * as path from 'path';
const fileName = path.basename(document.fileName) || 'Untitled';
```

**Effort:** 2 min

---

### 1.6 `DOMContentLoaded` may not fire in cached webview

**Severity:** Medium — can cause blank panel

**Problem:** In `index.ts` (~line 116), all initialization runs inside a `DOMContentLoaded` listener. If the webview HTML is cached and the DOM is already loaded when the script executes, `DOMContentLoaded` never fires. Result: blank panel.

**Fix:**
```typescript
function setup() {
    setupVSCodeMessageListener();
    init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
} else {
    setup();
}
```

**Effort:** 5 min

---

### 1.7 Workspace indexer: delete-vs-update race condition

**Severity:** Medium — causes stale ghost entries

**Problem:** In `indexManager.ts`, the file watcher's `onDidDelete` calls `removeFile(uri)` immediately, while `processUpdateQueue` processes queued `updateFile(uri)` calls asynchronously. If a file is queued for update and then deleted before the update runs, `updateFile()` re-adds a stale entry for a deleted file.

**Fix:**
```typescript
async processUpdateQueue() {
    for (const uri of queue) {
        try {
            try {
                await vscode.workspace.fs.stat(uri);
            } catch {
                this.removeFile(uri);
                continue;
            }
            await this.updateFile(uri);
        } catch (err) {
            console.error(`Index update failed for ${uri.fsPath}:`, err);
        }
    }
}
```

**Effort:** 30 min

---

### 1.8 Uncaught errors in `processUpdateQueue` skip remaining files

**Problem:** In `indexManager.ts`, if `updateFile()` throws, the entire queue processing loop exits. All remaining queued files are silently skipped.

**Fix:** Wrap each iteration in try/catch (shown combined with 1.7 above). Log the error and continue processing remaining files.

**Effort:** 10 min

---

### 1.9 Unhandled `viewLocationOptions` and `pinCreated` messages

**Severity:** Medium — pins feature feels broken

**Problem:** The extension host sends `viewLocationOptions` and `pinCreated` messages to the webview, but the webview's message listener in `index.ts` doesn't handle either. They are silently dropped — the pins dropdown never updates after pin/unpin.

**Fix:** Add handlers in `setupVSCodeMessageListener`:
```typescript
case 'viewLocationOptions':
    updateViewLocationDropdown(message.options);
    break;
case 'pinCreated':
    addPinnedTab(message.pin);
    break;
```

Also: `handlePinnedTabSwitch` (~line 495-527) is defined but never called — wire it up or remove.

**Effort:** 20 min

---

### 1.10 Defensive guards — selections, empty config values, pin feedback

**Problem:** Several small defensive checks are missing:

1. **`e.selections[0]` without length check** (extension.ts ~line 269) — throws if `selections` is empty
2. **Empty string in `additionalFileExtensions`** (extension.ts ~line 38) — `"." + ""` becomes `"."`, matching too many files
3. **`pinVisualization` silently does nothing** (visualizationPanel.ts ~line 291) — no error feedback when `_context` is undefined

**Fix:**
```typescript
// 1. Guard selections
if (e.selections && e.selections.length > 0) { ... }

// 2. Filter empty extensions
const validExts = additionalExts.map(e => e.trim()).filter(e => e.length > 0);

// 3. Feedback on failed pin
if (!VisualizationPanel._context) {
    vscode.window.showErrorMessage('Cannot pin: extension context not available');
    return;
}
```

**Effort:** 15 min

---

## Phase 2: Visual Cleanup (< 1 day)

Low-risk, high-reward fixes. Mostly find-and-replace or one-liner corrections.
Run `npx tsc --noEmit && npm test` after each sub-task.

### 2.1 Purge `rgba(15, 23, 42, ...)` — the blue-tint ghost

**Problem:** 40 occurrences of the old slate-900 blue-tint color across 8 files. Canvas is correctly `#111111`, but secondary surfaces and shadows still carry the blue tint. `themeTokens.ts` already defines the correct neutral values — these callsites just aren't using them.

**Action:**
- For **backgrounds**: replace `rgba(15, 23, 42, ...)` with `rgba(17, 17, 17, ...)` (matches `#111111`)
- For **shadows/overlays**: replace with `rgba(0, 0, 0, ...)` at equivalent opacity
- Better yet: import from `UI_SURFACE.dark.*` in `themeTokens.ts` where possible

**Files (occurrence count):**
| File | Count |
|------|-------|
| `src/webview/ui/toolbar.ts` | 15 |
| `src/webview/renderer.ts` | 9 |
| `src/webview/constants/colors.ts` | 7 |
| `src/webview/ui/batchTabs.ts` | 4 |
| `src/webview/ui/compareView.ts` | 2 |
| `src/webview/ui/resizablePanel.ts` | 1 |
| `src/webview/ui/pinnedTabs.ts` | 1 |
| `src/workspace/ui/sharedStyles.ts` | 1 |

---

### 2.2 Fix dark `textMuted` value

**Problem:** `NODE_SURFACE.dark.textMuted` and `UI_SURFACE.dark.textMuted` are both `#94A3B8`. On a `#1A1A1A` node, this doesn't recede enough from `#F1F5F9` primary text — the visual hierarchy is too flat. There's reportedly a test that expects it NOT to be `#94A3B8`.

**Decision:** Use `#71717A` (Zinc-500) for **both** `NODE_SURFACE.dark.textMuted` and `UI_SURFACE.dark.textMuted`.

**Why this value:**
- `#94A3B8` on `#1A1A1A` is *too readable* — it competes with `#F1F5F9` primary text instead of receding. The hierarchy feels flat.
- `#71717A` on `#1A1A1A` gives ~4.7:1 contrast — still WCAG AA compliant, but noticeably quieter. Metadata reads as "there if you want it, out of the way if you don't."
- Same value for both node and UI muted text because: (a) simpler to maintain, (b) the `#1A1A1A`→`#111111` background gap is only 9 units — not enough to justify separate values, (c) visual consistency across nodes and panels feels more polished as an end user.

**Action:**
- Change both `NODE_SURFACE.dark.textMuted` and `UI_SURFACE.dark.textMuted` to `#71717A` in `src/shared/themeTokens.ts`
- Verify and update any test assertions that reference the old value
- Grep for hardcoded `#94A3B8` in `src/` (currently 12 occurrences across 5 files) — decide per-callsite whether it should use the token or stay as-is

**Files with hardcoded `#94A3B8`:**
| File | Count |
|------|-------|
| `src/shared/themeTokens.ts` | 6 (definitions — update these) |
| `src/webview/renderer.ts` | 2 |
| `src/webview/constants/colors.ts` | 1 |
| `src/webview/ui/legendBar.ts` | 2 |
| `src/webview/ui/firstRunOverlay.ts` | 1 |

---

### 2.3 Fix ESLint warnings (20 total)

**Problem:** 19 missing curly braces in `sqlParser.ts`, 1 `==` in `stringUtils.ts`. All auto-fixable.

**Action:**
```bash
npx eslint 'src/**/*.ts' --fix
```
- The `value == null` in `stringUtils.ts:20` is the idiomatic JS null/undefined check. Either suppress with `// eslint-disable-next-line eqeqeq` or change to `value === null || value === undefined`.

---

### 2.4 Wrap bare `localStorage` calls

**Problem:** Two `localStorage` calls in `clientScripts.ts` (~lines 2822, 3222) and four in `resizablePanel.ts` (~lines 17, 108, 114, 197) are not wrapped in try/catch, while other `localStorage` calls in the same file are. In restricted contexts, `localStorage` can throw.

**Action:** Wrap all `localStorage` calls consistently:
```javascript
let columnTraceHintDismissed = false;
try { columnTraceHintDismissed = localStorage.getItem(columnTraceHintStorageKey) === '1'; } catch {}

try { localStorage.setItem(columnTraceHintStorageKey, '1'); } catch {}
```

**Effort:** 10 min

---

### 2.5 Unify monospace font stack

**Problem:** Two different font stacks used inconsistently:
- `'SF Mono', Monaco, 'Cascadia Code', monospace` (renderer.ts:555)
- `'Monaco', 'Menlo', 'Consolas', monospace` (renderer.ts:4141, edgeRenderer.ts:263)
- Bare `monospace` (30+ places in sharedStyles.ts, toolbar, etc.)

**Action:** Create a shared constant:
```typescript
// In src/shared/themeTokens.ts or a new src/shared/fonts.ts
export const MONO_FONT_STACK = "'SF Mono', Monaco, 'Cascadia Code', 'Menlo', 'Consolas', monospace";
```
Then grep and replace all inline font-family declarations. For CSS-in-string contexts (sharedStyles.ts), use the constant via template literal.

**Effort:** 1 hr

---

## Phase 3: Focused Polish (1–2 days)

Higher-impact improvements that require some design decisions.

### 3.1 Replace remaining emoji icons with SVGs

**Problem:** ~29 emoji references across 7 production files. They render as colorful platform-specific glyphs alongside clean monochrome SVG icons. `icons.ts` already has SVG equivalents for most.

**Hotspots:**
| File | Count | Examples |
|------|-------|---------|
| `renderer.ts` | 12 | 📊, 🔄, 📄, ✓ |
| `toolbar.ts` | 9 | ⚡, ⚠, 👁, ✓ |
| `batchTabs.ts` | 2 | ⚡, ⚠ |
| `clientScripts.ts` | 2 | ✓ |
| `hintsHierarchy.ts` | 1 | ⚡ |
| `colors.ts` | 2 | ✓ |
| `workspacePanel.ts` | 1 | ✓ |

**Action:**
1. Audit `src/shared/icons.ts` for existing SVG equivalents
2. Add any missing icons (warning, check, lightning, eye, chart, refresh, document)
3. Replace each emoji callsite with the SVG icon, using inline `<svg>` for HTML contexts

**Effort:** 3-4 hrs

---

### 3.2 Fix first-run overlay Unicode

**Problem:** `firstRunOverlay.ts` uses Unicode glyphs (`\u2328`, `\u2502`, `\u2318P`, `\u26A1`) for tip icons. These render inconsistently across platforms. Minor since it's seen once, but it's the first impression.

**Action:** Replace with inline SVG icons from `icons.ts`. Small file, quick fix.

**Effort:** 1 hr

---

### 3.3 Add Z-Index constants

**Problem:** Z-index values range from 1 to 11000 across 60+ declarations in 16 files with no system. Current rough layers:
- Panels: 100–1000
- Command bar: 2000
- First-run overlay: 3000
- Toasts: 9999
- Dropdowns: 10000–11000
- Fullscreen: 10000

**Action:** Create `src/shared/zIndex.ts`:
```typescript
export const Z_INDEX = {
    canvas: 0,
    edge: 10,
    node: 20,
    legend: 100,
    panel: 200,
    breadcrumb: 300,
    toolbar: 500,
    dropdown: 1000,
    commandBar: 1500,
    modal: 2000,
    toast: 3000,
    overlay: 4000,
    fullscreen: 5000,
} as const;
```
Then migrate the 60+ inline z-index values.

**Effort:** 2-3 hrs

---

### 3.4 Extend AbortController coverage

**Problem:** 4 UI modules use AbortController for listener cleanup (commandBar, legendBar, layoutPicker, exportDropdown). 5 modules still add listeners without cleanup: `toolbar.ts`, `batchTabs.ts`, `pinnedTabs.ts`, `breadcrumbBar.ts`, `resizablePanel.ts`.

**Action:** Apply the same established pattern to the remaining 5 modules.

**Effort:** 2-3 hrs

---

### 3.5 Add compare mode unit tests

**Problem:** `compareView.ts` (606 lines) has one test file but it mostly does source-string assertions. The `computeCompareDiff` function has one actual unit test. The diff algorithm needs more coverage.

**Action:** Add tests for:
- Empty/identical results (no diffs)
- Completely different node sets
- Node detail changes (modified columns)
- Stats delta edge cases (zero values, negative deltas)
- Large node set performance

**Effort:** 2-3 hrs

---

### 3.6 Fix SC icon not rendering in Cursor IDE

**Problem:** The custom "SC" icon in the editor title bar uses `<text>` elements. Cursor's SVG sanitizer strips `<text>` elements from extension-contributed icons.

**Action:**
1. Convert the "SC" letterforms to `<path>` elements (use Inkscape: Text → Object to Path)
2. Alternatively, replace with an abstract flow-diagram icon
3. Verify renders in both VS Code and Cursor
4. Keep both light and dark variants

**Effort:** 30 min

---

### 3.7 Compact query stats layout — single-row metrics

**Problem:** The Query Stats panel header uses two rows for summary metrics when it could be one:
```
Row 1:  8 Tables    0 Joins    0 Filters
Row 2:         4 CTEs
```

**Proposed change:** Display all metrics in a single flex row:
```
8 Tables  ·  0 Joins  ·  0 Filters  ·  4 CTEs
```

**Implementation:** Change the stats grid from fixed 3-column to `display: flex; flex-wrap: wrap; gap: 12px;`.

**Effort:** 15–30 min

---

### 3.8 Add `sql-crack.visualize` to Command Palette

**Problem:** Only `sql-crack.analyzeWorkspace` appears in the Command Palette. The main visualize command is only reachable via editor title bar icon, context menu, or keybinding. Users who search for "SQL" or "visualize" won't find it.

**Fix:** In `package.json`, add a `commandPalette` entry:
```json
{
    "command": "sql-crack.visualize",
    "when": "editorLangId == sql || sqlCrack.isAdditionalSqlFile",
    "group": "navigation"
}
```

**Effort:** 1 min

---

### 3.9 Add theme and configuration change listeners

**Problem:** The visualization panel bakes the current theme and all settings into the HTML at creation time. No listeners for `onDidChangeActiveColorTheme` or `onDidChangeConfiguration`. Users have to close and reopen the panel to see changes.

**Fix (visualizationPanel.ts):**
```typescript
// Theme changes
vscode.window.onDidChangeActiveColorTheme(() => {
    this._panel.webview.postMessage({ command: 'themeChanged' });
}, null, this._disposables);

// Configuration changes
vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('sqlCrack')) {
        this.refresh(currentOptions);
    }
}, null, this._disposables);
```

**Effort:** 1 hr

---

### 3.10 Dialect change doesn't invalidate workspace index

**Problem:** `setDialect()` in `indexManager.ts` changes the scanner's dialect but does **not** clear or rebuild the workspace index. All existing index entries were parsed with the previous dialect.

**Fix:**
```typescript
setDialect(dialect: string) {
    if (this._dialect !== dialect) {
        this._dialect = dialect;
        this._scanner.setDialect(dialect);
        this.clearIndex();
        this.buildIndex();
    }
}
```

**Effort:** 20 min

---

### 3.11 File watcher missing exclude patterns

**Problem:** `findSqlFiles()` in `indexManager.ts` excludes `node_modules`, `.git`, `dist`, `build` from its search, but `createFileSystemWatcher()` uses the same glob **without** exclusions. The watcher indexes SQL files from those directories, causing inconsistent state.

**Fix:**
```typescript
private shouldIndexFile(uri: vscode.Uri): boolean {
    const path = uri.fsPath;
    const excludes = ['node_modules', '.git', 'dist', 'build'];
    return !excludes.some(ex => path.includes(`${sep}${ex}${sep}`) || path.includes(`${sep}${ex}`));
}
```

**Effort:** 15 min

---

### 3.12 Renderer polish: resize throttle, null guards, ARIA, style cleanup

**Problem:** Several minor issues in `renderer.ts`:

1. **Resize handler not throttled** (~line 534) — fires on every pixel of a window drag
2. **Non-null assertions on map lookups** (~lines 1509, 2674, 4347) — throws if key is missing
3. **Main SVG missing `role="img"` and `aria-label`** — screen readers can't identify the graph
4. **`<style>` elements injected but never removed** (~lines 686, 746) — accumulate on content replacement
5. **Wheel handler missing `{ passive: false }`** in `clientScripts.ts` (~line 669) — `preventDefault()` silently fails

**Effort:** 30 min total

---

### 3.13 Walkthrough media and marketplace keywords

**Problem:**
1. All four walkthrough steps define `"media": { "markdown": "" }` — blank panels
2. No `keywords` in `package.json` — missing marketplace discoverability

**Fix:**
```json
// 1. Add keywords to package.json
"keywords": ["sql", "visualization", "diagram", "flow", "lineage", "query", "database"],

// 2. Add actual media to walkthrough steps or remove empty entries
"media": { "image": "assets/walkthrough-step1.png", "altText": "..." }
```

**Effort:** 15 min (keywords) + 1-2 hrs (walkthrough media)

---

## Phase 4: Feature Enhancements (Multi-day)

New capabilities that add significant user value.

### 4.1 Visualize full SELECT flow inside INSERT ... SELECT statements

**Problem:** `INSERT INTO daily_sales_summary (...) SELECT ... FROM orders ...` currently renders as just 2 nodes: the target table node and a generic INSERT result node. The inner SELECT — which may contain JOINs, aggregations, subqueries, etc. — is completely ignored.

**Root Cause:** In `src/webview/sqlParser.ts`, `processStatement()` routes SELECT statements to `processSelect()` but handles INSERT by falling through to the generic non-SELECT path. This generic path only extracts `stmt.table` (the target) and creates a simple two-node graph.

**The pattern already exists:** `CREATE VIEW ... AS SELECT` and `CREATE TABLE AS SELECT` both extract the inner SELECT and call `processSelect()`.

**Proposed implementation:**
```
In processStatement(), after the CREATE handling block:

1. Detect INSERT ... SELECT:
   - Check ctx.statementType === 'insert'
   - Check if stmt.values is a SELECT statement

2. If inner SELECT found:
   a. Process inner SELECT: selectRootId = processSelect(innerSelect, nodes, edges)
   b. Create target table node with INSERT/WRITE badges
   c. Connect: SELECT output → target table → INSERT result

3. If no inner SELECT (plain INSERT ... VALUES):
   - Fall through to existing generic handling
```

**Effort:** 2-4 hrs
**Impact:** High — INSERT ... SELECT is one of the most common write patterns in SQL

---

### 4.2 Visualize inner queries in all DML write operations

Beyond INSERT ... SELECT (4.1), several other write-operation patterns currently render as minimal 2-node stubs.

#### Tier 1 — High value, common patterns:

| # | Pattern | Example |
|---|---------|---------|
| 1 | `INSERT ... SELECT` | See 4.1 |
| 2 | `UPDATE ... FROM` (PostgreSQL/T-SQL) | Source tables + JOIN flow → target table → UPDATE |
| 3 | `UPDATE ... WHERE col IN (SELECT ...)` | Subquery flow → filter → target table → UPDATE |
| 4 | `DELETE ... WHERE col IN (SELECT ...)` | Subquery flow → filter → target table → DELETE |
| 5 | `DELETE ... WHERE EXISTS (SELECT ...)` | Subquery flow → filter → target table → DELETE |

#### Tier 2 — Medium value, less common:

| # | Pattern | Example |
|---|---------|---------|
| 6 | `INSERT ... ON CONFLICT DO UPDATE` (PG upsert) | SELECT flow → target table → UPSERT node |
| 7 | `WITH cte AS (...) INSERT/DELETE` (writable CTEs) | CTE flow → write operation |
| 8 | `UPDATE ... SET col = (SELECT ...)` (scalar subquery) | Scalar subquery feeding into UPDATE |

#### Tier 3 — OK as-is (no inner query to visualize):
`INSERT ... VALUES`, simple `UPDATE ... SET`, simple `DELETE ... WHERE`, `TRUNCATE`

**Total effort Tier 1:** 1-2 days | **Including Tier 2:** 2-3 days

---

### 4.3 Improve dialect auto-detection — three-part names and parse-failure retry

**Problem:** SQL files using Snowflake-style three-part table names (`database.schema.table`) are not detected by auto-detection. Parser defaults to MySQL, which fails, resulting in degraded 2-node fallback.

**Missing detection patterns:**

| Signal | Dialects it implies |
|--------|-------------------|
| `database.schema.table` (three-part names) | Snowflake, T-SQL, Redshift |
| `QUALIFY` | Snowflake, BigQuery |
| `ILIKE` | Snowflake, PostgreSQL |
| `CREATE OR REPLACE TABLE` | Snowflake |
| `MERGE INTO` | Snowflake, T-SQL, Oracle |

**Two-part fix:**

**Part A — Add missing detection patterns** (30 min):
```typescript
hasThreePartNames: /\b\w+\.\w+\.\w+\b/.test(sql),
hasQualify: /\bQUALIFY\b/i.test(sql),
hasIlike: /\bILIKE\b/i.test(sql),
hasCreateOrReplaceTable: /CREATE\s+OR\s+REPLACE\s+TABLE/i.test(sql),
```

**Part B — Retry with detected dialect on parse failure** (1-2 hrs):
```
Primary parse (default dialect)
  ↓ fails
detectDialect() → different dialect suggestion?
  ↓ yes
Retry primary parse (suggested dialect)
  ↓ fails
Regex fallback (existing behavior)
```

**Test cases included:** 5 SQL snippets covering three-part names, QUALIFY, ILIKE, combined signals, and parse-failure retry.

**Effort:** 2-3 hrs total
**Impact:** High — eliminates "works in VS Code but not in Cursor" issues

---

### 4.4 Auto-hoist CTEs nested inside subqueries (Tableau-generated SQL)

**Problem:** Snowflake allows `WITH` clauses inside subqueries — commonly generated by Tableau. `node-sql-parser` only supports `WITH` at statement top level, so these fail to parse.

```sql
SELECT t."COL1", t."COL2"
FROM (
  WITH cte1 AS (SELECT ...),
       cte2 AS (SELECT ...)
  SELECT * FROM cte1 JOIN cte2 ...
) t
```

**Proposed fix:** Detect `FROM ( WITH ... )` pattern and hoist CTEs to top level before parsing. This is a semantically equivalent transformation.

**Edge cases:** Multiple nesting levels, CTEs with subqueries, string literals containing `WITH`, merging with existing top-level CTEs.

**Effort:** 3-4 hrs
**Impact:** High — unlocks parsing of Tableau-generated SQL

---

### 4.5 Parser: handle `#` comments and edge cases

**Problem:** Multiple parser functions strip `--` and `/* */` comments but **not** MySQL-style `#` line comments. Additional edge cases:
- Unclosed `/* ... */` — parser gets raw comment text
- Empty/whitespace-only input — blank panel with no feedback
- Regex fallback edges with empty source/target — invisible broken edges

**Fix:**
```typescript
// 1. Strip # comments
sql = sql.replace(/#[^\n\r]*/g, '');

// 2. Handle unclosed block comments
if (endIdx === -1) { remaining = ''; break; }

// 3. Reject empty input
if (!sql || !sql.trim()) { return { valid: false, error: 'Empty SQL input' }; }

// 4. Filter broken edges
edges = edges.filter(e => e.source && e.target);
```

**Effort:** 1 hr

---

## Phase 5: Nice-to-Haves

Lower priority items that add polish.

### 5.1 Add error logging to empty catch blocks
15 `catch {}` blocks across the codebase. At minimum, add `console.debug()` or route through `logger.ts`.

### 5.2 Export dropdown format support
Workspace view may benefit from JSON/DOT export formats.

### 5.3 `#1E293B` audit for dark-theme misuse
`#1E293B` is correctly used as light-theme text, but check for places it's used as a dark-theme background.

### 5.4 Contributor DX: document `npm install` requirement
`npm test` fails without `npm install` first. Add a note to `CONTRIBUTING.md`.

---

## Architecture (Deferred)

These structural changes require multi-day effort and are tracked separately. They are important for long-term maintainability but do not affect users directly.

- **Split `renderer.ts`** (9,474 lines) — highest priority when ready
- **Split `sqlParser.ts`** (5,208 lines)
- **Split `clientScripts.ts`** (4,091 lines) and `sharedStyles.ts` (4,603 lines)
- **Split `toolbar.ts`** (1,924 lines)
- **Reduce `any` usage** (~168 instances) — create AST node type interfaces
- **Add VS Code High-Contrast theme support**
- **Fix `SqlDialect` import leak** — move to `src/shared/types.ts`

---

## Status Tracker

| # | Task | Phase | Effort | Risk | Impact | Status |
|---|------|-------|--------|------|--------|--------|
| 1.1 | XSS: inline onclick | P1 Security | 15 min | None | High | DONE |
| 1.2 | XSS: tooltip innerHTML | P1 Security | 10 min | None | High | DONE |
| 1.3 | XSS: batchTabs escaping | P1 Security | 15 min | None | Medium | DONE |
| 1.4 | XSS: onclick hardening | P1 Security | 30 min | Low | Medium | DONE |
| 1.5 | Windows path handling | P1 Bug | 2 min | None | High | DONE |
| 1.6 | DOMContentLoaded guard | P1 Bug | 5 min | None | Medium | DONE |
| 1.7 | Indexer delete-update race | P1 Bug | 30 min | Low | Medium | DONE |
| 1.8 | processUpdateQueue error handling | P1 Bug | 10 min | None | Medium | DONE |
| 1.9 | Unhandled pin/location messages | P1 Bug | 20 min | Low | Medium | DONE |
| 1.10 | Defensive guards | P1 Bug | 15 min | None | Low-Med | DONE |
| 2.1 | Purge rgba(15,23,42) | P2 Visual | 1-2 hrs | Low | High | DONE |
| 2.2 | Fix textMuted value | P2 Visual | 30 min | Low | Medium | DONE |
| 2.3 | ESLint fix | P2 Visual | 5 min | None | Low | DONE |
| 2.4 | localStorage try/catch | P2 Visual | 10 min | None | Low | DONE |
| 2.5 | Font stack constant | P2 Visual | 1 hr | None | Low | DONE |
| 3.1 | Emoji → SVG | P3 Polish | 3-4 hrs | Low | High | DONE |
| 3.2 | First-run overlay Unicode | P3 Polish | 1 hr | None | Medium | DONE |
| 3.3 | Z-Index constants | P3 Polish | 2-3 hrs | Low | Medium | DONE |
| 3.4 | AbortController coverage | P3 Polish | 2-3 hrs | Low | Medium | DONE |
| 3.5 | Compare mode tests | P3 Polish | 2-3 hrs | None | Medium | DONE |
| 3.6 | SC icon for Cursor | P3 Polish | 30 min | None | Medium | DONE |
| 3.7 | Compact stats layout | P3 Polish | 15-30 min | None | Low-Med | DONE |
| 3.8 | Visualize command in palette | P3 Polish | 1 min | None | High | DONE |
| 3.9 | Theme/config change listeners | P3 Polish | 1 hr | Low | Med-High | DONE |
| 3.10 | Dialect invalidate index | P3 Polish | 20 min | Low | Med-High | DONE |
| 3.11 | File watcher excludes | P3 Polish | 15 min | None | Medium | DONE |
| 3.12 | Renderer polish (5 items) | P3 Polish | 30 min | Low | Low-Med | DONE |
| 3.13 | Walkthrough media + keywords | P3 Polish | 1-2 hrs | None | Medium | DONE |
| 4.1 | INSERT...SELECT visualization | P4 Feature | 2-4 hrs | Medium | High | DONE |
| 4.2 | All DML write ops (Tier 1) | P4 Feature | 1-3 days | Medium | High | DONE |
| 4.3 | Dialect auto-detection | P4 Feature | 2-3 hrs | Low | High | TODO |
| 4.4 | Auto-hoist nested CTEs | P4 Feature | 3-4 hrs | Medium | High | TODO |
| 4.5 | Parser: # comments + edge cases | P4 Feature | 1 hr | Low | Medium | TODO |

**Totals by phase:**
| Phase | Items | Est. Time |
|-------|-------|-----------|
| P1: Security & Bugs | 10 | ~2.5 hrs |
| P2: Visual Cleanup | 5 | ~2-4 hrs |
| P3: Focused Polish | 13 | ~1.5-2 days |
| P4: Feature Enhancements | 5 | ~2-4 days |
| P5: Nice-to-Haves | 4 | ~1-2 hrs |
| Architecture (Deferred) | 7 | ~1-2 weeks |

---

*Generated: Feb 10, 2026 — Reviews from: Claude (architecture/code), External Review 1 (UX/theme), External Review 2 (security/lint/DX)*
*Updated: Feb 10, 2026 — Reorganized by priority; promoted bugs and security items from backlog; deferred architecture phase*
*Updated: Feb 11, 2026 — Completed P3 items 3.11-3.13 with tests and validation*
