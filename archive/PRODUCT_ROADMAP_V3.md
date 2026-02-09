# SQL Crack — Product Roadmap V3

**Created:** 2026-02-08
**Branch:** road_map_v2
**Status:** Living document — update as items are completed
**Predecessor:** PRODUCT_ROADMAP_V2.md (8 items, all complete)

---

## Priority Legend
- **P1** — High impact, users will hit this and get frustrated
- **P2** — Medium impact, polish that builds trust
- **P3** — Low impact, nice to have

---

## 1. Smart Query Tab Labels [P1]

**Problem:** Batch tabs show "Q1", "Q2", "Q3" with a truncated 100-char tooltip. In a 30-query migration file, users can't tell queries apart without hovering each one. This is the first thing people complain about with multi-statement files.

**Scope:**
- Extract a meaningful label from each query's first statement keyword + target object
- Examples: `INSERT users`, `CREATE VIEW report_v2`, `SELECT orders`, `UPDATE inventory`
- Fall back to `Q1`, `Q2` only if extraction fails
- Tooltip remains full SQL preview (increase from 100 to 200 chars)
- Truncate long labels to ~20 chars with ellipsis

**Approach:**
- Parse first keyword (`SELECT`, `INSERT INTO`, `CREATE TABLE`, `UPDATE`, `DELETE FROM`, `MERGE INTO`, `WITH`)
- Extract first table/view name after keyword
- For CTEs (`WITH x AS ...`), use the CTE name
- For `SELECT` without obvious target, use first FROM table

**Files:**
- `src/webview/ui/batchTabs.ts` — line 138-139 where `tab.innerHTML = Q${i + 1}` is set
- New helper: `extractQueryLabel(sql: string): string`

**Tests:**
- `INSERT INTO users SELECT ...` → label "INSERT users"
- `CREATE VIEW report_v2 AS ...` → label "CREATE report_v2"
- `WITH monthly AS (...) SELECT ...` → label "CTE monthly"
- `SELECT * FROM orders WHERE ...` → label "SELECT orders"
- Empty/unparseable SQL → falls back to "Q1"
- Label longer than 20 chars → truncated with "..."

**Status:** [x] Complete (Phase 1)

---

## 2. Dialect Auto-Detection [P1]

**Problem:** Users must manually select dialect from a dropdown that's easy to miss. `detectDialectSpecificSyntax()` already identifies dialect-specific patterns (Snowflake `:` paths, BigQuery `STRUCT`, PostgreSQL `$$`, T-SQL `CROSS APPLY`, MySQL backticks) but only uses them for warning hints. The detection logic exists — it's just not wired to auto-selection.

**Scope:**
- Run dialect detection on the raw SQL before parsing
- If a single dialect is detected with high confidence, auto-select it
- If multiple dialects detected or none, keep user's default
- Show "Auto-detected: PostgreSQL" indicator in toolbar (clickable to override)
- Never override an explicit user selection in the current session

**Approach:**
- Score each dialect based on pattern matches (existing regex patterns in `detectDialectSpecificSyntax()`)
- Confidence threshold: if one dialect scores 2+ matches and others score 0, auto-select
- If ambiguous, show "Dialect unclear — using default" with detected options
- Store user override in session state so auto-detect doesn't fight the user

**Files:**
- `src/webview/sqlParser.ts` — `detectDialectSpecificSyntax()` at line ~4517, refactor to return scores
- `src/webview/index.ts` — auto-detect before first parse, update dialect selector
- `src/webview/ui/toolbar.ts` — "Auto-detected: X" indicator near dialect dropdown

**Tests:**
- SQL with `LATERAL FLATTEN(...)` → auto-detects Snowflake
- SQL with backtick identifiers + `ON DUPLICATE KEY` → auto-detects MySQL
- SQL with `$$` body + `RETURNING` → auto-detects PostgreSQL
- SQL with `CROSS APPLY` + `TOP 10` → auto-detects TransactSQL
- SQL with `STRUCT<>` + `UNNEST` → auto-detects BigQuery
- Ambiguous SQL (plain `SELECT ... FROM ... JOIN`) → keeps default dialect
- User manually selects dialect → auto-detect disabled for session

**Status:** [x] Complete (Phase 2)

---

## 3. Export Preview Dialog with PDF Support [P1]

**Problem:** Users click "Save PNG" and get whatever zoom level they're at — could be 4000px wide or 200px. No preview, no quality options, no PDF. Anyone sharing with non-dev stakeholders needs PDF, and everyone wants to see what they're exporting before saving.

**Scope:**
- Add export preview modal showing a scaled-down preview of the output
- PNG options: width/height (or scale factor), DPI (72/144/300), background (transparent/white/dark)
- SVG options: embed fonts (yes/no), optimize (remove unused defs)
- PDF export: render SVG to PDF via canvas (jsPDF or similar lightweight lib)
- Mermaid: add "Copy to clipboard" option (currently only file save in SQL Flow panel)
- Preview updates live as options change

**Approach:**
- Modal overlay with preview area (scaled to fit) + options sidebar
- PNG: render to off-screen canvas at specified DPI, show preview at screen DPI
- PDF: render PNG at 300 DPI, embed in single-page PDF sized to content
- Keep it simple — no multi-page, no headers/footers for V1

**Files:**
- `src/webview/ui/exportDropdown.ts` — trigger preview modal instead of direct export
- New file: `src/webview/ui/exportPreview.ts` — modal UI, preview rendering, option controls
- `src/webview/renderer.ts` — expose `renderToCanvas(options)` and `renderToSvgString(options)`
- `package.json` — no new dependency if using built-in canvas; or add `jspdf` (~280KB) for PDF

**Tests:**
- Preview modal opens with current visualization
- Changing DPI updates preview dimensions display
- PNG export at 2x produces double-resolution image
- PDF export generates valid PDF blob
- Mermaid copy to clipboard works (SQL Flow panel)
- Cancel closes modal without exporting
- Transparent background option removes grid from PNG

**Status:** [x] Complete (Phase 2)

---

## 4. Resizable Panels [P1]

**Problem:** Details panel (260px), stats panel (300px), and hints panel (350px) are hardcoded widths. On a 13" laptop they overlap the graph. On a 27" monitor they're too small. Users can't resize or collapse them — the only option is toggling visibility.

**Scope:**
- Add drag-to-resize handles on the inner edge of each panel
- Persist panel widths in localStorage per panel
- Add collapse/expand toggle (click the resize handle or a chevron icon)
- Respect minimum width (150px) and maximum (50% of viewport)
- Panels should not overlap each other — if two right-side panels are open, stack them

**Approach:**
- CSS `resize` property won't work well for positioned panels — use mousedown/mousemove drag
- Store widths as `{ details: 260, stats: 300, hints: 350 }` in localStorage
- On drag, update `width` style and `right`/`left` offset of adjacent panels
- Collapse: animate to 0 width, show a small tab/handle to re-expand

**Files:**
- `src/webview/renderer.ts` — details panel creation (~line 185), stats panel (~line 275), hints panel (~line 294)
- New utility: `src/webview/ui/resizablePanel.ts` — reusable resize handle logic
- `src/webview/constants/colors.ts` — resize handle colors (theme-aware)

**Tests:**
- Drag resize changes panel width
- Width persists across refresh (localStorage)
- Minimum width enforced (can't resize below 150px)
- Maximum width enforced (can't exceed 50% viewport)
- Collapse toggle hides panel content, shows expand handle
- Theme change updates resize handle colors

**Status:** [x] Complete (Phase 2)

---

## 5. Configurable Parse and Size Limits [P1]

**Problem:** `maxSqlSizeBytes` (100KB) and `maxQueryCount` (50) are hardcoded in `sqlParser.ts` line 35-36. `PARSE_TIMEOUT_MS` (5s) is hardcoded at line 44. Schema dumps and migration files routinely exceed 100KB/50 statements. The graceful truncation from V2 helps, but users should be able to bump limits via settings.

**Scope:**
- Expose 3 new VS Code settings: `sqlCrack.advanced.maxFileSizeKB`, `sqlCrack.advanced.maxStatements`, `sqlCrack.advanced.parseTimeoutSeconds`
- Read settings in the extension host and pass to webview via message
- Webview uses these values instead of hardcoded defaults
- Show current limits in truncation warning messages

**Approach:**
- Add settings to `package.json` contributes.configuration
- Extension host reads settings on activation + listens for changes
- Pass limits to webview in `refresh` message payload
- `validateSql()` accepts limits as parameter (already partially structured for this)
- `PARSE_TIMEOUT_MS` already has `setParseTimeout()` — wire it to the setting

**Files:**
- `package.json` — add 3 new settings under `sqlCrack.advanced`
- `src/extension.ts` or equivalent — read settings, pass to webview
- `src/webview/sqlParser.ts` — `validateSql()` at line 61, `PARSE_TIMEOUT_MS` at line 44
- `src/webview/index.ts` — receive limits from extension host message

**Defaults:**
- `maxFileSizeKB`: 100 (range: 50-1000)
- `maxStatements`: 50 (range: 10-500)
- `parseTimeoutSeconds`: 5 (range: 2-30)

**Tests:**
- Setting maxFileSizeKB to 500 allows 400KB file to parse
- Setting maxStatements to 200 allows 150-statement file
- Setting parseTimeoutSeconds to 15 changes timeout behavior
- Invalid values clamped to range
- Default values match current behavior (no regression)

**Status:** [x] Complete (Phase 1)

---

## 6. Improved Keyboard Node Navigation [P2]

**Problem:** Basic node navigation exists (arrow keys, Enter, Escape) via `navigateToAdjacentNode()` at ~line 4335. But it's limited: no Tab/Shift+Tab cycling through all nodes, no visual focus ring, no screen reader announcements, no edge-following navigation. Power users and accessibility-dependent users both need more.

**Scope:**
- Tab/Shift+Tab: cycle through all nodes in layout order (left-to-right, top-to-bottom)
- Arrow Up/Down: follow edges upstream/downstream (already partially works)
- Arrow Left/Right: cycle siblings at the same depth level
- Visible focus ring around currently focused node (high-contrast, theme-aware)
- `aria-label` on each SVG node group with node name and type
- Screen reader live region announcing focused node details
- Focus mode integration: Tab only cycles visible nodes when focus mode is active

**Files:**
- `src/webview/renderer.ts` — `navigateToAdjacentNode()` ~line 4335, SVG node creation
- `src/webview/constants/colors.ts` — focus ring color (distinct from selection highlight)
- SVG node groups — add `tabindex="0"`, `role="button"`, `aria-label`

**Tests:**
- Tab cycles through all nodes in order
- Shift+Tab cycles in reverse
- Arrow Up follows edge to upstream node
- Arrow Down follows edge to downstream node
- Focus ring visible on currently focused node
- Escape clears focus and returns to SVG container
- Focus mode filters which nodes Tab visits

**Status:** [x] Complete (Phase 3)

---

## 7. Minimap Toggle Setting [P2]

**Problem:** Minimap auto-shows when there are 2+ nodes (threshold in `minimapVisibility.ts` line 1). There's no user setting to disable it. Some users find it essential for navigation, others find it clutter that overlaps with the error badge at `top: 56px, left: 12px`.

**Scope:**
- Add VS Code setting: `sqlCrack.showMinimap` with options: `auto` (current behavior), `always`, `never`
- `auto`: show when node count >= threshold (current default)
- `always`: show even for single-node graphs
- `never`: hide minimap entirely
- Minimap position should not overlap error badge — move to bottom-left or make position configurable

**Files:**
- `package.json` — add `sqlCrack.showMinimap` setting (enum: auto/always/never, default: auto)
- `src/webview/minimapVisibility.ts` — `shouldShowMinimap()` reads setting
- `src/webview/renderer.ts` — minimap creation (~line 344), pass setting value
- `src/webview/index.ts` — receive setting from extension host

**Tests:**
- `auto` + 5 nodes → minimap visible
- `auto` + 1 node → minimap hidden
- `always` + 1 node → minimap visible
- `never` + 100 nodes → minimap hidden
- Setting change takes effect without full refresh

**Status:** [x] Complete (Phase 1)

---

## 8. Colorblind-Safe Palette [P2]

**Problem:** The visualization uses 14 node colors, 7 edge colors, and 3 severity colors to convey information. No alternative encoding exists (patterns, shapes, icons). Roughly 8% of males have some form of color vision deficiency. Red/green distinctions (used for read vs write nodes, success vs error) are the most commonly confused.

**Scope:**
- Add a colorblind-safe palette option (deuteranopia-optimized as the most common type)
- Use IBM's colorblind-safe palette or Wong's 8-color palette as a base
- Add shape/icon differentiation alongside color: write nodes get a pencil icon, error nodes get a triangle
- Add a VS Code setting: `sqlCrack.colorblindMode` (off/deuteranopia/protanopia/tritanopia)
- Ensure all color-only distinctions have a secondary indicator (icon, pattern, label)

**Approach:**
- Create alternate color maps in `src/webview/constants/colors.ts` for each mode
- `getNodeColors(type, colorblindMode)` returns appropriate palette
- For edge colors: add dash patterns (dashed, dotted, dash-dot) alongside color
- For severity: add icons (info circle, warning triangle, error X) alongside color

**Files:**
- `src/webview/constants/colors.ts` — add `COLORBLIND_NODE_COLORS`, `COLORBLIND_EDGE_COLORS`
- `src/shared/theme.ts` — add colorblind variant exports
- `src/webview/renderer.ts` — node/edge rendering to use palette based on setting
- `package.json` — add `sqlCrack.colorblindMode` setting

**Tests:**
- Deuteranopia palette has sufficient contrast between all node types (WCAG AA)
- Edge types distinguishable by dash pattern alone (without color)
- Severity levels have icon indicators alongside color
- Setting toggle switches palette without full re-render

**Status:** [x] Complete (Phase 3)

---

## 9. Clickable Error Badge with Navigation [P2]

**Problem:** The error badge at `top: 56px, left: 12px` shows parse error count with a tooltip listing errors — but clicking it does nothing. Users see "3 errors" but have to manually hunt through batch tabs to find which queries failed. The badge should be the primary way to navigate to errors.

**Scope:**
- Click error badge → jump to first error tab (switch batch tab + scroll to error)
- If already on an error tab, click → jump to next error tab (cycle through)
- Show error count with severity breakdown in badge: "2 err, 1 warn" instead of just count
- Error badge tooltip: make each error line clickable (jump to that specific query tab)
- Add keyboard shortcut: `E` to jump to next error

**Files:**
- `src/webview/ui/toolbar.ts` — `updateErrorBadge()` at ~line 1700, add click handler
- `src/webview/index.ts` — `switchToQuery()` message handler for tab navigation
- `src/webview/ui/batchTabs.ts` — expose `switchToTab(index)` for programmatic switching

**Tests:**
- Click badge with errors → switches to first error tab
- Click badge again → switches to next error tab (cycles)
- Click badge with no errors → no action
- Tooltip shows severity breakdown
- `E` keyboard shortcut jumps to next error
- Single error → badge click always goes to that tab

**Status:** [x] Complete (Phase 1)

---

## 10. Better Batch Tab Error UX [P2]

**Problem:** When 5 of 7 queries parse and 2 fail, the error summary shows "5 ok, 2 err" — but the red border on error tabs is a subtle `border-bottom: 2px solid red` that's easy to miss. Users don't realize specific tabs have errors until they click through each one.

**Scope:**
- Error tabs: stronger visual treatment — red background tint, error icon (triangle), pulsing dot
- Success tabs: subtle green checkmark or green accent
- Partial parse tabs: yellow/amber treatment (regex fallback was used)
- Tab tooltip for error tabs: show the actual error message, not just truncated SQL
- Error summary clickable: "2 failed" text is a link that opens a dropdown listing failures

**Files:**
- `src/webview/ui/batchTabs.ts` — tab rendering (~line 128-145), error summary (~line 210-232)
- `src/webview/constants/colors.ts` — error/success/partial tab colors (theme-aware)

**Tests:**
- Error tab has visible error icon and red tint
- Success tab has subtle success indicator
- Partial parse tab has amber indicator
- Tab tooltip for error includes error message
- Error count in summary is clickable
- Theme switch updates error/success colors

**Status:** [x] Complete (Phase 2)

---

## 11. Fullscreen Exit Button [P2]

**Problem:** Fullscreen mode (toggled by `F` key) hides the toolbar and all panels. The only way to exit is pressing Escape — but there's no visible affordance telling users this. Users unfamiliar with the shortcut get "stuck" in fullscreen with no obvious way out.

**Scope:**
- Show a floating "Exit Fullscreen" button in the top-right corner during fullscreen mode
- Button appears on mouse move, fades out after 2 seconds of inactivity
- Also show a brief toast on entering fullscreen: "Press ESC or F to exit fullscreen"
- Button uses the same frosted-glass style as legend bar

**Files:**
- `src/webview/renderer.ts` — `toggleFullscreen()` at ~line 7247
- `src/webview/constants/fullscreen.ts` — add exit button to fullscreen UI elements

**Tests:**
- Entering fullscreen shows toast message
- Exit button visible on mouse move in fullscreen
- Exit button fades after 2s inactivity
- Clicking exit button exits fullscreen
- Exit button not present outside fullscreen
- ESC and F key still work as before

**Status:** [x] Complete

---

## 12. Expandable Search Box [P3]

**Problem:** Search box is fixed at 140px (`toolbar.ts` line 357). Searching for `customer_order_details_v2` gets truncated. Users can't see their full search term, making regex searches particularly painful.

**Scope:**
- Search box starts at 140px, expands to 280px on focus
- Smooth CSS transition (200ms ease)
- Collapse back to 140px on blur (if empty)
- If search has text, stay expanded until cleared
- Overflow menu adjusts to accommodate expanded search

**Files:**
- `src/webview/ui/toolbar.ts` — search box creation (~line 357), focus/blur handlers
- Toolbar overflow logic — recalculate visible buttons when search expands

**Tests:**
- Search box 140px by default
- Focus expands to 280px with smooth transition
- Blur with empty search collapses
- Blur with text stays expanded
- Toolbar overflow recalculates on expand/collapse

**Status:** [x] Complete

---

## 13. Undo/Redo for Layout Changes [P3]

**Problem:** Users drag nodes, adjust CTE cloud positions, change focus mode, toggle column lineage — then accidentally refresh and lose everything. There's zero undo infrastructure in the codebase. Every layout change is permanent and irreversible.

**Scope:**
- Track layout-affecting actions in a history stack (max 50 entries)
- Undoable actions: node drag, CTE cloud drag, focus mode change, layout algorithm switch, zoom/pan reset
- Keyboard shortcuts: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)
- Toolbar buttons: undo/redo arrows (disabled when stack is empty)
- History stack clears on new parse (fresh SQL = fresh history)

**Approach:**
- Snapshot-based: store minimal state diffs (node positions, zoom, focus mode)
- Not full re-render on undo — just restore position/state and update SVG transforms
- Keep it lightweight: only position data, not full SVG DOM snapshots

**Files:**
- New file: `src/webview/ui/undoManager.ts` — history stack, snapshot/restore logic
- `src/webview/renderer.ts` — hook into drag end, layout change, focus change events
- `src/webview/ui/toolbar.ts` — undo/redo buttons

**Tests:**
- Drag node → undo restores original position
- Multiple drags → undo walks back through each
- Redo after undo restores the change
- New action after undo clears redo stack
- History clears on new parse
- Max 50 entries, oldest dropped on overflow
- Cmd+Z / Cmd+Shift+Z shortcuts work

**Status:** [x] Complete (Phase 4)

---

## 14. Query Comparison Mode [P3]

**Problem:** Users optimizing queries need to see before/after visualizations side-by-side. Currently they can pin a query, but pinned tabs replace the current view — there's no split-screen comparison. This is something no other SQL visualization tool does well.

**Scope:**
- "Compare" button in toolbar (or right-click pinned tab → "Compare with current")
- Split the webview into left/right panes, each with independent zoom/pan
- Highlight differences: nodes added (green), removed (red), changed (yellow)
- Show stats diff: "3 more joins, 1 fewer subquery, complexity: +12"
- Compare any two: current vs pinned, pinned vs pinned, current vs clipboard SQL

**Approach:**
- Reuse existing renderer in a new container (left pane) — don't duplicate code
- Parse both queries, diff the node/edge lists
- Diff algorithm: match nodes by table name + type, flag unmatched as added/removed
- Stats comparison is straightforward (already structured as numbers)

**Files:**
- New file: `src/webview/ui/compareView.ts` — split pane layout, diff rendering
- `src/webview/renderer.ts` — support multiple render targets (currently assumes single SVG)
- `src/webview/sqlParser.ts` — no changes (parse both independently)
- `src/webview/ui/toolbar.ts` — compare button

**Tests:**
- Compare shows two visualizations side-by-side
- Added nodes highlighted green in right pane
- Removed nodes highlighted red in right pane
- Stats diff shows correct delta values
- Independent zoom/pan in each pane
- ESC or close button exits compare mode

**Status:** [x] Complete (Phase 4)

---

## 15. Inline VS Code Diagnostics [P3]

**Problem:** The parser generates valuable hints (fan-out warnings, non-sargable filters, repeated table scans, dead columns, missing indexes) — but they're only visible inside the webview panel. Users have to open the visualization to discover issues. Surfacing hints as VS Code diagnostics (squiggly underlines) makes the extension passively useful.

**Scope:**
- Create a VS Code `DiagnosticCollection` for SQL Crack hints
- Map parser hint severities to VS Code diagnostic severities (high → Error, medium → Warning, low → Information)
- Map hint line numbers to document ranges
- Update diagnostics on file save (or on auto-refresh if enabled)
- Diagnostics clear when file is closed or has no SQL
- Code actions: "Show in SQL Flow" quick fix opens the visualization panel

**Files:**
- `src/extension.ts` — create `DiagnosticCollection`, register document change listener
- New file: `src/diagnostics.ts` — hint-to-diagnostic mapping, range calculation
- `src/webview/sqlParser.ts` — no changes (hints already have line numbers and severities)

**Tests:**
- Parser hint with line number → diagnostic at correct range
- High severity hint → Error diagnostic
- Medium severity → Warning diagnostic
- File close clears diagnostics
- "Show in SQL Flow" code action opens panel
- No diagnostics for files with no parse hints

**Status:** [x] Complete (Phase 4)

---

## Small Wins (Bundle with any release)

These are quick fixes that can be included alongside any of the above items:

| # | Item | File | Effort | Status |
|---|------|------|--------|--------|
| A | Increase tooltip SQL preview from 100 to 200 chars | `batchTabs.ts` line 139 | 5 min | ✅ Complete |
| B | Mermaid "Copy to clipboard" in SQL Flow export | `exportDropdown.ts` | 15 min | ✅ Complete |
| C | Localize pinned tab timestamps with `toLocaleString()` | `toolbar.ts` pinned tabs | 10 min | ✅ Complete |
| D | Empty workspace state: show "Open a .sql file to get started" | `workspacePanel.ts` | 15 min | ✅ Complete |
| E | Move minimap to bottom-left to avoid error badge overlap | `renderer.ts` ~line 344 | 10 min | ✅ Complete |

---

## Implementation Order (Suggested)

### Phase 1 — Quick Wins (1-2 sessions)
Items: **1** (tab labels), **5** (configurable limits), **7** (minimap toggle), **9** (error badge click), **Small Wins A-E**

*Rationale:* Small scope, high visibility, no architectural changes. Each is self-contained.

### Phase 2 — Core Polish (3-5 sessions)
Items: **2** (dialect auto-detect), **4** (resizable panels), **10** (batch tab error UX), **11** (fullscreen exit), **12** (expandable search)

*Rationale:* Medium scope, improves daily workflow. Dialect auto-detect is the biggest UX win here.

### Phase 3 — Professional Features (5-8 sessions)
Items: **3** (export preview + PDF), **6** (keyboard navigation), **8** (colorblind palette)

*Rationale:* Larger scope, requires design decisions. Export preview is the most user-requested feature in this tier.

### Phase 4 — Differentiators (8-12 sessions)
Items: **13** (undo/redo), **14** (comparison mode), **15** (inline diagnostics)

*Rationale:* Significant architecture. Each is a selling point but needs careful design. Undo/redo requires the most infrastructure. Comparison mode is the most unique.

---

## Completion Tracking

| # | Item | Priority | Phase | Status |
|---|------|----------|-------|--------|
| 1 | Smart query tab labels | P1 | 1 | ✅ Complete |
| 2 | Dialect auto-detection | P1 | 2 | ✅ Complete |
| 3 | Export preview + PDF | P1 | 3 | Not started |
| 4 | Resizable panels | P1 | 2 | ✅ Complete |
| 5 | Configurable limits | P1 | 1 | ✅ Complete |
| 6 | Keyboard node navigation improvements | P2 | 3 | ✅ Complete |
| 7 | Minimap toggle setting | P2 | 1 | ✅ Complete |
| 8 | Colorblind-safe palette | P2 | 3 | ✅ Complete |
| 9 | Clickable error badge | P2 | 1 | ✅ Complete |
| 10 | Better batch tab error UX | P2 | 2 | ✅ Complete |
| 11 | Fullscreen exit button | P2 | 2 | ✅ Complete |
| 12 | Expandable search box | P3 | 2 | ✅ Complete |
| 13 | Undo/redo for layout | P3 | 4 | ✅ Complete |
| 14 | Query comparison mode | P3 | 4 | ✅ Complete |
| 15 | Inline VS Code diagnostics | P3 | 4 | ✅ Complete |
