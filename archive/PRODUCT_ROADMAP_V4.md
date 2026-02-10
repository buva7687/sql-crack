# SQL Crack — Product Roadmap V4

**Created:** 2026-02-09
**Branch:** road_map_v3
**Status:** Living document — update as items are completed
**Predecessor:** PRODUCT_ROADMAP_V3.md (15 items, 14 complete — Export Preview carried forward)
**Source:** External code reviews (`review_1.txt`, `review_2.txt`) against main branch

---

## Priority Legend
- **P1** — Bug / security issue, or high-impact user-facing problem
- **P2** — Polish that builds trust and consistency
- **P3** — Nice to have, long-term maintainability

---

## What Was Already Fixed

The following review items were verified as resolved on `road_map_v3`:

| Review | Item | Status |
|--------|------|--------|
| R1 #6 | Light background #FAFAFA vs #FFFFFF | Reviewer approved as-is — deliberate good deviation |
| R1 #7 | Export dropdown missing JSON/DOT for workspace | Fixed — `exportUtils.ts` now has JSON + DOT options |
| R2 #4 | localStorage access without try-catch | Fixed — all accesses now wrapped |
| R2 #7 | Missing await on async calls in message handlers | Fixed — proper async/await in handlers |
| R2 #1 (README) | README missing 4 settings | Fixed — all settings documented |

---

## Phase 1 — Bugs & Security Fixes

### 1. Edge Attribute Mismatch — Graph Focus/Trace Broken [P1] [BUG]

**Problem:** `graphView.ts` renders edges with `data-source-id` and `data-target-id`, but `clientScripts.ts` reads `data-source` and `data-target` (no `-id` suffix). This means focus mode, trace mode, and neighbor highlighting in the workspace graph are all non-functional — `source` and `target` are always `null`.

**Scope:**
- Audit all `getAttribute('data-source')` / `getAttribute('data-target')` calls in `clientScripts.ts`
- Change to `getAttribute('data-source-id')` / `getAttribute('data-target-id')` to match `graphView.ts`
- Also check `workspacePanel.ts` and `lineageGraphRenderer.ts` for the same mismatch

**Files:**
- `src/workspace/ui/clientScripts.ts` — lines ~267-269, ~301, ~371
- `src/workspace/workspacePanel.ts` — lines ~1639-1640
- `src/workspace/ui/lineageGraphRenderer.ts` — lines ~582-583
- `src/workspace/ui/graphView.ts` — line ~216 (source of truth)

**Tests:**
- Focus mode highlights connected edges
- Trace mode follows upstream/downstream paths
- Neighbor highlighting shows adjacent edges on node hover

**Status:** [x] Complete — Fixed `graphView.ts` to use `data-source`/`data-target` (matching all other renderers and `clientScripts.ts`)

---

### 2. HTML Escaping in Lineage Result Rendering [P1] [SECURITY]

**Problem:** In `clientScripts.ts`, `n.name`, `n.type`, `n.filePath`, and `message.data.error` are interpolated directly into HTML without escaping. While exploitation requires crafted SQL file names or table names, `escapeHtml()` already exists in the same file — it should be used consistently.

**Scope:**
- Wrap all dynamic values in lineage result rendering with `escapeHtml()`
- Also escape error messages injected via `innerHTML`

**Files:**
- `src/workspace/ui/clientScripts.ts` — lines ~1756-1758 (n.name, n.type, n.filePath), line ~1780 (error message)
- Audit for any other raw `innerHTML` assignments with dynamic data in the same file

**Tests:**
- Table name containing `<script>` renders as text, not executed
- File path with HTML entities displays correctly
- Error message with HTML tags is escaped

**Status:** [x] Complete — Added `escapeHtmlSafe()` to main script scope, applied to `n.name`, `n.type`, `n.filePath`, and `message.data.error`

---

### 3. File Watcher Ignores Custom Extensions [P1] [BUG]

**Problem:** The scanner discovers files with additional extensions from the `additionalFileExtensions` setting, but the file watcher is hardcoded to `**/*.sql`. Files with `.hql`, `.bteq`, `.tpt` etc. won't trigger incremental index updates on save/change/create.

**Scope:**
- Build the watcher glob from the same extension list the scanner uses
- React to configuration changes and recreate the watcher when extensions change
- Default glob remains `**/*.sql` when no additional extensions configured

**Files:**
- `src/workspace/indexManager.ts` — line ~463 (hardcoded `**/*.sql`)
- Read additional extensions from the same config the scanner uses

**Tests:**
- `.hql` file change triggers index update when `.hql` is in additional extensions
- Changing the extensions setting recreates the watcher
- Default behavior unchanged when no additional extensions set

**Status:** [x] Complete — `getWatcherGlob()` builds pattern from config, `onDidChangeConfiguration` recreates watcher

---

### 4. Concurrency Guard on buildIndex() [P1] [BUG]

**Problem:** `buildIndex()` can be invoked concurrently (user triggers re-index while auto-index is running). No mutex or in-progress flag exists, so two builds can overwrite each other's results. Additionally, `processUpdateQueue()` can race with `buildIndex()`.

**Scope:**
- Add a promise-based guard so concurrent `buildIndex()` calls return the same promise
- Skip or buffer `processUpdateQueue()` while a build is in progress

**Approach:**
```typescript
private _buildPromise: Promise<WorkspaceIndex> | null = null;

async buildIndex(...): Promise<WorkspaceIndex> {
    if (this._buildPromise) { return this._buildPromise; }
    this._buildPromise = this._doBuildIndex(...);
    try { return await this._buildPromise; }
    finally { this._buildPromise = null; }
}
```

**Files:**
- `src/workspace/indexManager.ts` — `buildIndex()` (line ~67), `processUpdateQueue()` (line ~484)

**Tests:**
- Two concurrent `buildIndex()` calls return same result (not two separate builds)
- Queue processing deferred while build is in progress
- Queued updates applied after build completes

**Status:** [x] Complete — `_buildPromise` guard on `buildIndex()`, `_doBuildIndex()` extracted, `processUpdateQueue()` awaits active build

---

## Phase 2 — UI/UX Consistency & Polish

### 5. Legend Bar Default to Visible [P2]

**Problem:** Legend bar starts hidden (`legendVisible = false`) and only shows if localStorage has a saved `true` value. First-time users — the audience who needs it most — never see it unless they discover the `L` shortcut. The design intent is "visible by default, dismissable, remembers preference."

**Scope:**
- Change default from `false` to `true`
- Existing users who dismissed it keep their saved preference (localStorage `'false'`)
- New users see it immediately

**Files:**
- `src/webview/renderer.ts` — line ~116 (`legendVisible: false` → `true`)

**Status:** [x] Completed (2026-02-10) — `9e2993a`

---

### 6. Dark Theme textMuted Contrast [P2]

**Problem:** `textMuted` for dark theme is `#94A3B8` (slate-400) — too bright for metadata text on `#1A1A1A` nodes. It competes with the primary label (`#F1F5F9`). The hierarchy between primary and muted text isn't clear enough.

**Scope:**
- Change dark `textMuted` to `#71717A` (zinc-500) or `#6B7280` (gray-500) — something that clearly recedes
- Verify contrast ratios: primary-to-muted should be noticeable, muted-to-background should still meet WCAG AA

**Files:**
- `src/webview/constants/colors.ts` — `NODE_SURFACE.dark.textMuted` (line ~212)
- Grep for any other hardcoded `#94A3B8` or `#94a3b8` usage

**Status:** [x] Completed (2026-02-10) — `200d856`

---

### 7. Unicode Icons in Layout Picker [P2]

**Problem:** A full SVG icon library exists in `icons.ts`, but the layout picker still uses Unicode symbols (`↓`, `→`, `⊞`, `◎`, `◉`). This creates a visual mismatch — some UI has crisp SVG strokes, others have platform-dependent Unicode rendering.

**Scope:**
- Replace Unicode layout icons with SVG equivalents from `icons.ts` (or add new ones)
- Ensure consistent sizing and alignment with other icon usage in toolbar

**Files:**
- `src/webview/ui/layoutPicker.ts` — lines ~15-19 (LAYOUTS array icon field)
- `src/shared/icons.ts` — add layout-specific icons if not present

**Status:** [x] Completed (2026-02-10) — `fa086f2`

---

### 8. Command Bar Theme Detection Consistency [P2]

**Problem:** `showCommandBar()` detects theme with `document.documentElement.classList.contains('vscode-dark')` — a hardcoded check. Everywhere else uses a passed-in `isDarkTheme()` callback. This breaks if the theme class name changes.

**Scope:**
- Replace hardcoded class check with the same callback pattern used elsewhere

**Files:**
- `src/webview/ui/commandBar.ts` — line ~249

**Status:** [x] Completed (2026-02-10) — `e098099`

---

### 9. Complete prefers-reduced-motion Coverage [P2]

**Problem:** A `prefers-reduced-motion` check exists in toolbar.ts and renderer.ts, but `legendBar.ts`, `breadcrumbBar.ts`, `exportDropdown.ts`, and the command bar entrance have unguarded CSS transitions.

**Scope:**
- Create a shared utility: `const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches`
- Use it (or CSS `@media (prefers-reduced-motion: reduce)`) to disable transitions across all UI modules
- Audit all `transition:` CSS in webview UI files

**Files:**
- `src/webview/ui/legendBar.ts` — `transition: transform 0.2s ease, opacity 0.2s ease`
- `src/webview/ui/breadcrumbBar.ts` — any CSS transitions
- `src/webview/ui/exportDropdown.ts` — hover transitions
- `src/webview/ui/commandBar.ts` — entrance animation

**Status:** [x] Completed (2026-02-10) — `2dc8e01`, follow-up fix `8d566a3`

---

### 10. Toolbar Resize Debouncing [P2]

**Problem:** `updateOverflow()` runs on every `ResizeObserver` callback without debouncing. High-frequency resize events (dragging editor border) cause excessive DOM measurements.

**Scope:**
- Add ~100ms debounce to the `ResizeObserver` callback for `updateOverflow()`

**Files:**
- `src/webview/ui/toolbar.ts` — lines ~649, ~737

**Status:** [x] Completed (2026-02-10) — `bfbb932`, follow-up fix `8d566a3`

---

## Phase 3 — Features & Developer Experience

### 11. Export Preview Dialog with PDF Support [P1] (Carried from V3)

**Problem:** Users click "Save PNG" and get whatever zoom level they're at. No preview, no quality options, no PDF. Anyone sharing with non-dev stakeholders needs PDF.

**Scope:**
- Export preview modal showing scaled-down preview + options sidebar
- PNG options: scale factor, DPI (72/144/300), background (transparent/white/dark)
- SVG options: embed fonts, optimize
- PDF export: render SVG to PDF via canvas (jsPDF or similar)
- Preview updates live as options change

**Files:**
- `src/webview/ui/exportDropdown.ts` — trigger preview modal instead of direct export
- New file: `src/webview/ui/exportPreview.ts` — modal UI, preview rendering
- `src/webview/renderer.ts` — expose `renderToCanvas(options)` and `renderToSvgString(options)`

**Tests:**
- Preview modal opens with current visualization
- Changing DPI updates dimensions display
- PNG at 2x produces double-resolution image
- PDF generates valid blob
- Cancel closes without exporting
- Transparent background removes grid from PNG

**Status:** [ ] Not started

---

### 12. Typed Message Protocol [P2]

**Problem:** Both `visualizationPanel.ts` and `workspacePanel.ts` handle messages as `any` with `switch/case` on `message.command`. Typos in command strings are silent failures.

**Scope:**
- Define discriminated union types for webview-to-host and host-to-webview messages
- Apply types to message handlers in both panels
- Compile-time safety for message command names and payloads

**Approach:**
```typescript
type WebviewMessage =
  | { command: 'goToLine'; line: number }
  | { command: 'savePng'; data: string; filename: string }
  | { command: 'pinVisualization'; sql: string; dialect: string; name: string }
  // ...
```

**Files:**
- New file: `src/types/messages.ts` (or split into `sqlFlowMessages.ts` / `workspaceMessages.ts`)
- `src/visualizationPanel.ts` — type the `onDidReceiveMessage` handler
- `src/workspace/handlers/messageHandler.ts` — type `handleMessage()`

**Status:** [ ] Not started

---

### 13. Event Listener Cleanup with AbortController [P3]

**Problem:** Webview UI modules add event listeners but don't clean them up on reinitialization. If modules are reinitialized without full webview reload, listeners accumulate.

**Scope:**
- Use `AbortController` pattern for grouping listeners per module
- On reinitialization, `abort()` previous controller before adding new listeners

**Approach:**
```typescript
const controller = new AbortController();
element.addEventListener('click', handler, { signal: controller.signal });
// Cleanup: controller.abort() removes all listeners
```

**Files:**
- `src/webview/ui/toolbar.ts`
- `src/webview/ui/commandBar.ts`
- `src/webview/ui/legendBar.ts`
- `src/webview/ui/layoutPicker.ts`
- `src/webview/ui/exportDropdown.ts`

**Status:** [x] Complete — AbortController added to legendBar, commandBar, layoutPicker, exportDropdown with dispose functions exported via barrel index

---

### 14. Walkthrough Steps with Actual Media [P3]

**Problem:** Walkthrough steps in `package.json` have empty `"markdown": ""` media. VS Code renders these prominently in the Getting Started tab — actual screenshots or GIFs would significantly improve onboarding.

**Scope:**
- Add screenshots or short GIF demonstrations for each walkthrough step
- Store media in `media/walkthrough/` directory

**Files:**
- `package.json` — walkthrough steps (lines ~363-399)
- New directory: `media/walkthrough/` — screenshot/GIF assets

**Status:** [ ] Not started

---

### 15. Debug Logging Documentation Fix [P3]

**Problem:** README Troubleshooting says "Help > Toggle Developer Tools > Console" but doesn't mention the `sqlCrack.advanced.debugLogging` setting which outputs to VS Code's Output Channel. The Output Channel approach is more user-friendly.

**Scope:**
- Update Troubleshooting section to recommend Output Channel + `debugLogging` setting as primary method
- Keep Developer Tools mention as secondary/advanced option

**Files:**
- `README.md` — Troubleshooting section

**Status:** [x] Complete — README updated to recommend Output Channel + `debugLogging` as primary, DevTools as secondary

---

## Phase 4 — Code Architecture

### 16. Split clientScripts.ts (~3,843 lines) [P3]

**Problem:** Largest client-side file combining graph interactions, view navigation, message handling, search, export, and lineage interactions in a single string template. Hard to test, hard to navigate. Has duplicated escape functions (`escapeBreadcrumbText` at line ~1038, `escapeHtml` at line ~2176, plus another in `getUtilityScript()`).

**Scope:**
- Split into focused modules: graph interactions, lineage interactions, message handlers, search/filter, utility functions
- Deduplicate escape functions into a single shared utility
- Maintain the string-template pattern (these are injected into webview HTML) but organize the source

**Files:**
- `src/workspace/ui/clientScripts.ts` → split into:
  - `clientScripts/graphInteractions.ts`
  - `clientScripts/lineageInteractions.ts`
  - `clientScripts/messageHandlers.ts`
  - `clientScripts/search.ts`
  - `clientScripts/utils.ts`
  - `clientScripts/index.ts` (re-exports combined script)

**Status:** [ ] Not started

---

### 17. Split renderer.ts (~8,818 lines) [P3]

**Problem:** Core renderer handles node rendering, pan/zoom, cloud panels, context menus, minimap, search, fullscreen, statistics, hints panel, SQL preview, and more. The UX rewrite extracted `canvasSetup.ts` and `edgeRenderer.ts`, but further modularization would improve maintainability.

**Scope:**
- Extract focused modules while keeping the shared state accessible
- Candidate extractions: `nodeRenderer.ts`, `cloudPanel.ts`, `contextMenu.ts`, `searchHighlight.ts`, `statsPanel.ts`, `hintsPanel.ts`

**Files:**
- `src/webview/renderer.ts` → extract into `src/webview/renderer/` directory

**Status:** [ ] Not started

---

## Implementation Order

### Phase 1 — Bugs & Security (1-2 sessions)
Items: **1** (edge attributes), **2** (HTML escaping), **3** (file watcher), **4** (concurrency guard)

*Rationale:* These are correctness issues. The edge attribute bug means workspace graph interactions are broken. The HTML escaping is a security gap. Both should ship before new features.

### Phase 2 — UI/UX Consistency (2-3 sessions)
Items: **5** (legend default), **6** (textMuted contrast), **7** (layout picker icons), **8** (command bar theme), **9** (reduced-motion), **10** (toolbar debounce)

*Rationale:* Small, self-contained polish items. Each is under 30 minutes of work. Ship as a batch for a consistency-focused release.

### Phase 3 — Features & DX (5-8 sessions)
Items: **11** (export preview + PDF), **12** (typed messages), **13** (AbortController cleanup), **14** (walkthrough media), **15** (debug docs)

*Rationale:* Export preview is the last unfinished P1 from V3. Typed messages improve long-term reliability. The rest are incremental improvements.

### Phase 4 — Code Architecture (8-12 sessions)
Items: **16** (split clientScripts.ts), **17** (split renderer.ts)

*Rationale:* Highest effort, highest risk of regressions. Best done when the feature set is stable. Requires comprehensive test coverage before and after.

---

## Completion Tracking

| # | Item | Priority | Phase | Status |
|---|------|----------|-------|--------|
| 1 | Edge attribute mismatch (BUG) | P1 | 1 | ✅ Complete |
| 2 | HTML escaping in lineage (SECURITY) | P1 | 1 | ✅ Complete |
| 3 | File watcher custom extensions (BUG) | P1 | 1 | ✅ Complete |
| 4 | Concurrency guard on buildIndex (BUG) | P1 | 1 | ✅ Complete |
| 5 | Legend bar default to visible | P2 | 2 | ✅ Complete (`9e2993a`) |
| 6 | Dark theme textMuted contrast | P2 | 2 | ✅ Complete (`200d856`) |
| 7 | Unicode icons in layout picker | P2 | 2 | ✅ Complete (`fa086f2`) |
| 8 | Command bar theme detection | P2 | 2 | ✅ Complete (`e098099`) |
| 9 | Complete prefers-reduced-motion | P2 | 2 | ✅ Complete (`2dc8e01`, follow-up `8d566a3`) |
| 10 | Toolbar resize debouncing | P2 | 2 | ✅ Complete (`bfbb932`, follow-up `8d566a3`) |
| 11 | Export preview + PDF (V3 carry) | P1 | 3 | Not started |
| 12 | Typed message protocol | P2 | 3 | Not started |
| 13 | Event listener cleanup | P3 | 3 | ✅ Complete |
| 14 | Walkthrough media content | P3 | 3 | Not started |
| 15 | Debug logging docs fix | P3 | 3 | ✅ Complete |
| 16 | Split clientScripts.ts (~3,843 lines) | P3 | 4 | Not started |
| 17 | Split renderer.ts (~8,818 lines) | P3 | 4 | Not started |
