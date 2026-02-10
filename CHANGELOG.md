# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Undo/redo layout history**: Added bounded history for layout-affecting actions (drag, zoom, reset, layout, focus mode) with toolbar controls and keyboard shortcuts (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`).
- **Query comparison mode**: Added side-by-side baseline/current compare overlay with added/removed/changed node highlighting and stats delta summary.
- **Inline VS Code diagnostics**: SQL Crack parser hints now surface as editor diagnostics, with a Quick Fix action (**Show in SQL Flow**) to open the visualization directly. Gated behind `sqlCrack.advanced.showDiagnosticsInProblems` (off by default) to reduce noise.
- **Typed message protocol**: Added discriminated union types (`SqlFlowWebviewMessage`, `SqlFlowHostMessage`, `WorkspaceWebviewMessage`, `WorkspaceHostMessage`) for compile-time safety on all webview↔host message handlers.
- **Impact analysis `addColumn` change type**: Workspace impact analyzer now supports `addColumn` alongside `modify`, `rename`, and `drop`.
- **MIT license in manifest**: Added `license` field to `package.json` for marketplace compliance.
- **UI listener lifecycle cleanup**: Added AbortController-based listener teardown for legend bar, command bar, layout picker, and export dropdown module re-initialization paths.
- **Compare mode KPI example pair**: Added `compare-mode-kpi-before.sql` and `compare-mode-kpi-after.sql` to demonstrate correlated-subquery baseline vs CTE/join refactor diffs.

### Changed

- **Toolbar controls**: Added compare toggle and undo/redo controls with active/disabled state synchronization.
- **Diagnostics lifecycle**: Diagnostics are refreshed on open/save/auto-refresh, and cleared for closed documents or empty/non-SQL content.
- **Documentation sync**: Updated root and examples README content to reflect roadmap-delivered features/settings (compare mode, undo/redo, diagnostics, parser reliability, and current workspace view model).
- **Node border contrast**: Increased SQL Flow node border visibility — light theme `#E2E8F0`→`#94A3B8`, dark theme `#2A2A2A`→`#475569` — for better node definition without competing with semantic strokes.
- **Workspace zoom controls cleanup**: Replaced refresh-style "Reset view" icon with crosshair/target icon on Graph tab; removed redundant "Reset view" button from lineage zoom controls.
- **Legend default behavior**: Query-view legend now defaults to visible for first-time users while preserving saved dismissal state.
- **Layout picker visuals**: Replaced unicode layout glyphs with shared SVG icons for consistent rendering across platforms.
- **Accessibility consistency**: Unified reduced-motion handling across legend bar, breadcrumb bar, export dropdown, command bar, toolbar, and renderer via a shared motion utility.

### Fixed

- **Workspace graph focus/trace wiring**: Fixed edge data attribute mismatch so focus mode, trace traversal, and neighbor highlighting work reliably.
- **Workspace lineage XSS hardening**: Escaped dynamic lineage result fields and error content before HTML injection.
- **Custom extension watcher parity**: Workspace watcher now tracks configured SQL extensions (e.g. `.hql`, `.bteq`, `.tpt`) and recreates watcher on setting changes.
- **Index build race conditions**: Added in-flight `buildIndex()` promise guard and queue coordination to prevent concurrent build/result clobbering.
- **Dark node metadata contrast**: Reduced dark-theme muted node text emphasis for clearer hierarchy against node backgrounds.
- **Command bar theme source**: Removed hardcoded theme class checks in favor of callback-based theme resolution.
- **Toolbar overflow resize thrash**: Debounced overflow recalculation for high-frequency resize events.
- **Typecheck regressions in UI polish follow-up**: Fixed legend reduced-motion variable scope and browser timeout handle typing.
- **Edge dash pattern rendering**: Moved dash pattern handling into edge rendering flow so edge styles are restored correctly after hover and no orphaned scope code remains.
- **Transformation badge contrast**: Replaced hardcoded white fills with contrast-aware text coloring for improved light-theme legibility.
- **Viewport fit stability**: Clamped fit-view dimensions/scale to prevent upside-down node rendering on small viewports.
- **Resizable panel behavior**: Preserved preferred panel width so hints/details resizing behaves predictably across window resizes.
- **Parser resilience**: Added safe string handling to prevent `.toLowerCase()` crashes when AST values are non-string objects.
- **Hints panel interaction**: Hint rows now allow copy/select text (switched from button semantics to text-friendly container rendering).
- **Hints panel/legend overlap regressions**: Hints panel now reflows above the legend when legend height changes (toggle, wrap, viewport resize), with viewport-clamped panel/list heights.
- **Lineage fit-to-screen**: Fixed "Fit to screen" button in Data Lineage view — click handler was passing the MouseEvent as the `isAutoFit` parameter, causing the deduplication guard to silently block manual fits.
- **Diagnostics config key mismatch**: Fixed `advanced.*` config key resolution for diagnostics settings.

### Tests

- Added unit/regression coverage for undo manager behavior, compare mode wiring/diff logic, diagnostics mapping, and extension diagnostics wiring.
- Added regression coverage for Phase 1/2 roadmap fixes, including legend default visibility, dark muted color token, layout picker SVG icon usage, command bar theme callback usage, reduced-motion module coverage, and toolbar resize debounce logic.
- Added DOM-style panel layout regression tests for legend-height growth and viewport clamping of the performance hints panel.

## [0.2.1] - 2026-02-06

### Added

- **CREATE TABLE AS SELECT (CTAS)**: Inner SELECT is now processed to generate flow nodes and optimization hints, matching CREATE VIEW behavior.
- **Recursive CTE labels**: CTE nodes show `WITH RECURSIVE <name>` and "Recursive Common Table Expression" description when the recursive flag is set.
- **`||` dialect suggestion**: Parse errors involving the `||` concatenation operator now suggest switching to PostgreSQL or MySQL dialect.
- **Error line numbers**: Parse error badge tooltips show `Q1 (line 12): <message>` when line information is available.
- **Hints hierarchy module** (`hintsHierarchy.ts`): Sorts optimization hints by severity/type impact; provides compact badge state (ok/warning/error) for toolbar summary.
- **Warning indicator module** (`warningIndicator.ts`): Isolates performance warning logic; renders inline top-right triangle markers on nodes instead of floating circles.
- **Column lineage UX module** (`columnLineageUx.ts`): Centralizes column lineage discoverability (banner text, enable/trace guards).
- **SQL snippet module** (`sqlSnippet.ts`): Extracts SQL fragments for node tooltips with line labels.
- **Toolbar hints summary badge**: `⚡` button in toolbar showing hint count with color-coded status.
- **Column lineage active banner**: Non-blocking banner below toolbar indicating active column lineage mode.
- **Workspace export consolidation** (`exportUtils.ts`): Unified export dropdown with Copy Mermaid option; `generateWorkspaceMermaid()` utility.
- **Workspace SVG icons**: Replaced emoji icons with inline SVG across graph, lineage, table explorer, and impact views.
- **Workspace column trace onboarding**: One-time "Click a column to trace lineage across tables" hint on first column expand, persisted via localStorage.
- **Workspace expand-columns tooltip**: Collapsed lineage nodes show "Click to focus · Double-click to expand columns" on hover.
- **Workspace column lineage info panel**: Shows column name + source table, upstream/downstream counts, mini flow summary (`users.id → orders.user_id → report.customer_id`), and "Clear trace" button.
- **Workspace keyboard navigation**: Expanded column rows are keyboard-focusable with Enter to trace.
- **Workspace lineage legend + keyboard hints**: Integrated keyboard shortcut hints into lineage view legend.
- **One-time help button pulse**: Toolbar `?` button pulses once on first run to aid discoverability.
- **Full SQL preview tooltip cue**: Node tooltips mention the `S` shortcut for full SQL preview.
- **Workspace legend re-open affordance**: Added a dedicated legend toggle button to the Graph zoom toolbar so users can re-open the legend without keyboard-only discovery.
- **Lineage legend re-open affordance**: Added a dedicated legend toggle button to lineage zoom controls for the same show/hide behavior in lineage detail view.

### Changed

- **Node tooltips**: Footer now shows "Click to select · Double-click to zoom · Right-click for actions".
- **Warning badges on nodes**: Replaced floating circle badges with compact top-right triangle indicators.
- **Render state reset**: Switching queries now fully resets column lineage, search, breadcrumbs, and focus mode.
- **Overflow menu**: Fully theme-aware in light mode (button, dropdown rows, hover states).
- **Breadcrumb bar**: Uses theme-aware colors; suppresses legacy popup during column lineage mode.
- **Column lineage panel**: Themed scrollbar; explicit close button in header.
- **Workspace graph nodes**: Added `node-bg` class and `node-accent` strip so CSS theme variables apply correctly.
- **Workspace graph background**: Uses dot-grid pattern matching lineage view instead of solid background.
- **Workspace Graph legend UX**: Moved from sidebar section to a bottom frosted legend strip; removed the old sidebar legend block.
- **Lineage legend UX**: Replaced top-right collapsible legend panel with a bottom-anchored horizontal legend strip.
- **Legend copy cleanup**: Removed the misleading keyboard-style `× Dismiss` hint in the workspace legend strip; `L` remains the documented shortcut and `×` remains a click action.

### Fixed

- **Phantom LIMIT node**: PostgreSQL, Snowflake, Trino, and Redshift no longer show a spurious LIMIT node when no LIMIT clause exists. The "No LIMIT clause" optimization hint now correctly appears for these dialects.
- **Click-outside zoom reset**: Clicking empty canvas now restores the full view when zoomed into a node (previously required Escape).
- **Auto-refresh for non-`.sql` files**: `.hql`, `.ddl`, `.pgsql`, untitled files, and other non-`.sql` documents now trigger auto-refresh when the visualization panel is open.
- **Parse error positioning**: Parser diagnostics now preserve absolute line/column coordinates so editor and badge navigation land on the correct source location.
- **Fullscreen UI recovery**: Exiting fullscreen now consistently restores toolbar wrapper, breadcrumb bar, and parse error badge placement.
- **Toolbar popover overlays**: Toolbar menus render as floating overlays, preventing clipping and misplaced controls in constrained layouts.
- **Minimap sync stability**: Minimap visibility and viewport sync are now stable during query/view transitions.
- **Stats & hints panel overlap**: Panels dynamically shift above the legend bar when it is visible instead of being hidden behind it.
- **Column lineage banner overlap**: Banner no longer stretches full-width or captures clicks across query tabs; uses `pointer-events: none` with only the close button interactive.
- **Column lineage Escape dismiss**: Escape now closes column lineage mode from any focus context (SVG, document, or the lineage panel itself).
- **Snowflake DELETE parsing**: Snowflake DELETE/MERGE statements that fail native grammar now fall back to PostgreSQL AST parsing.
- **Light-theme toolbar**: Overflow button and dropdown rows use correct light-mode colors.
- **Breadcrumb/filter state**: Filter chips no longer leak stale state across re-renders.
- **Theme-toggle jitter**: Switching themes no longer triggers tab jump/flicker artifacts in the webview.
- **Collapsed sidebar canvas usage**: Graph now auto-fits after sidebar collapse/expand so newly available canvas space is used immediately.
- **Zoom control displacement**: Removed incorrect `zoom-toolbar` top offset that was applied when the bottom legend was visible.

### Tests

- Added regression coverage for:
  - workspace legend toolbar toggle behavior,
  - lineage legend toggle wiring,
  - auto-fit on sidebar layout changes,
  - legend strip style expectations.

---

## [0.2.0] - 2026-02-05

### Added

- **UX redesign**: Complete visual overhaul across query flow and workspace views (8-phase rewrite).
- **Theme token system**: New `src/shared/themeTokens.ts` — single source of truth for all theme colors, grid config, and accent colors.
- **SVG icon library**: `src/shared/icons.ts` with 18 SVG icons (16px) replacing emoji in UI elements.
- **Grid patterns**: Configurable canvas background — dots, lines, or none (`sqlCrack.gridStyle` setting).
- **Node accent strips**: Nodes use neutral fill + colored left accent strip instead of full-fill pastels (`sqlCrack.nodeAccentPosition` setting for left/bottom).
- **Bottom legend bar**: Frosted-glass legend strip at bottom of canvas with node type accent dots. Toggle with `L` key.
- **Export dropdown**: Consolidated export menu (PNG, SVG, Mermaid, Clipboard) replacing 4 separate toolbar buttons.
- **Layout picker**: Visual popover showing all 5 layouts with descriptions and keyboard shortcuts (1–5 keys), replacing blind `H` cycling.
- **Command bar**: `Ctrl+Shift+P` / `/` command palette with fuzzy-match filtering inside the webview.
- **Breadcrumb bar**: Filter/state indicator below toolbar showing active focus mode, search term, column trace, and CTE context.
- **First-run overlay**: Welcome overlay on first visualization open with feature callouts.
- **VS Code walkthrough**: 4-step onboarding walkthrough in `contributes.walkthroughs`.
- **Workspace navigation stack**: Back button with originating view name, per-view zoom/pan state preservation, crossfade transitions between views.
- **Accessibility**: `prefers-reduced-motion` support disabling all animations; `prefers-contrast: more` support with increased borders and high-contrast text colors; ARIA labels on interactive elements.
- **Renderer modularization**: Extracted `canvasSetup.ts`, `edgeRenderer.ts`, and barrel `index.ts` from renderer.ts into `src/webview/rendering/`.

### Changed

- **Dark theme background**: `#111111` (neutral) replacing `#0f172a` (blue-tinted) across all views.
- **Light theme background**: `#FAFAFA` replacing `#FFFFFF`.
- **Node design**: Neutral fill (`#FFFFFF` light / `#1A1A1A` dark) + 4px left accent strip (type-colored) for all node types including aggregate, window, case, CTE, and subquery nodes.
- **Edge colors**: `#CBD5E1` light / `#333333` dark default; `#6366F1` indigo on hover.
- **CTE/subquery clouds**: Theme-aware containers with neutral fill and accent-colored edges.
- **Toolbar**: Export dropdown and layout picker use `position: fixed` appended to `document.body` to escape `overflow: hidden` clipping.
- **Workspace views**: Unified theme with query flow — neutral-fill nodes, accent strips, theme-aware edges, updated sidebar/tooltip/search styles.
- **Keyboard shortcuts panel**: Fully theme-aware (light/dark) with updated colors and styling.
- **Stats/Hints panels**: Added subtle border and box-shadow for light theme visibility.
- **Column lineage panel**: Updated from blue-tinted to neutral theme colors for backgrounds, search input, column items, and hover states.

### Fixed

- **Export dropdown clipping**: Dropdown was hidden behind toolbar due to `overflow: hidden` — now appends to `document.body` with fixed positioning.
- **Layout picker clipping**: Same fix as export dropdown — uses body-appended fixed positioning.
- **Export dropdown theme switching**: Text color, separator backgrounds, and kbd badge colors now update on theme change.
- **Shortcuts panel always dark**: Fixed missed call site in toolbar help button that wasn't passing theme state.
- **Lineage path code elements**: Aggregate function expressions now have explicit styled backgrounds instead of inheriting dark webview defaults.
- **Cloud child node hover reset**: Aggregate/window/case nodes inside CTE/subquery clouds properly reset to neutral fill on mouseleave.

---

## [0.1.4] - 2026-02-04

### Added

- **Bottom-up flow direction**: New `sqlCrack.flowDirection` setting with `"top-down"` (default) and `"bottom-up"` options. Bottom-up mimics Snowflake query profile style where table scans start at the bottom and results flow upward. Applies to all dagre-based layouts (vertical, horizontal, compact) and Mermaid export.
- **Workspace Graph selection panel** with upstream/downstream context and quick actions.
- **Index freshness badge** showing when the workspace index was last built.
- **Empty-state overlay** for first open and no-match search results.
- **Search highlight** for matching graph nodes.
- **Lineage trace controls**: Trace Up/Down buttons for full upstream/downstream highlighting.
- **Impact Analysis grouping**: Transitive impacts grouped by parent table with collapsible UI.
- **Impact Analysis FK awareness**: Table-level foreign key constraints captured for dependency analysis.

### Changed

- **Impact Analysis paths**: Transitive impacts show `source → target` column paths using lineage edges.

### Changed

- **Regex escaping**: Consolidated inline regex escaping to use the shared `escapeRegex()` utility in `sqlParser.ts`, `lineNumbers.ts`, and `referenceExtractor.ts`.
- **Activation events**: Removed `onStartupFinished` to avoid unnecessary early activation when no SQL files are open.
- **Coverage thresholds**: Raised jest coverage thresholds to 60% (branches: 50%) as a regression guard.

### Fixed

- **Test failures (145 tests)**: Guarded `window.flowDirection` access in `sqlParser.ts` `layoutGraph` to fix `"window is not defined"` errors in Node.js test environment.
- **Graph shortcuts**: Keyboard shortcuts no longer interfere with search input.
- **Impact Analysis noise**: Exclude a table's own columns and only show columns with actual data flow.
- **Cross-file false positives**: Prevent transitive impacts from crossing unrelated schema files with shared table names.
- **Mermaid JOIN parse error**: Fixed invalid triple-brace `{{{...}}}` syntax for JOIN nodes causing Mermaid parse failures. JOIN nodes now use hexagon `{{...}}` shape; filter nodes use rhombus `{...}`.

### Improved

- **Debug logging**: Added parse timing logs (debug console) for SQL parsing duration, query count, and dialect.
- **Workspace logging**: Added index build start/completion/duration logs and error logging for file operation handlers.
- **Cache size warning**: User-facing notification when workspace index exceeds the 4MB cache limit, with guidance to narrow file scope.

## [0.1.3] - 2026-02-02

### Added

- **Keyboard navigation**: Arrow keys navigate between connected nodes; Tab cycles through nodes; focus trap keeps keyboard events in webview.
- **Panel animations**: Smooth slide-in/out transitions for Node Details and Optimization Hints panels.
- **Loading overlay**: Visual feedback when switching graph layouts (15+ nodes).
- **Pulse animation**: Nodes pulse when navigated to via search, zoom, or breadcrumb clicks.
- **Amber highlight for cloud sub-nodes**: Multi-pulse glow animation when navigating to tables inside CTE/subquery clouds.
- **Zoom persistence**: Zoom/pan state preserved when switching between query tabs.
- **"Clear filters" button**: Quick reset in hints panel when filters are active.
- **Shared `escapeRegex()` utility**: Centralized regex escaping in `src/shared/stringUtils.ts`.

### Changed

- **Zoom indicator**: Now displays percentage relative to "fit to view" (100% = fit view).
- **Zoom behavior**: Capped at 180% of fit-view scale to prevent excessive zooming; includes expanded cloud bounds in calculation.
- **Statement counting**: Improved accuracy for SQL without trailing semicolons.
- **Workspace index caching**: Added 4MB size limit guard and error handling for large workspaces.

### Fixed

- **CTE/subquery navigation**: Clicking a table in "Tables Used" now auto-expands the parent CTE cloud and highlights the table inside.
- **Broken edge on zoom**: Cloud containers now properly shown/hidden when zooming to expanded CTEs.
- **Regex injection (P2 security)**: Escaped special characters in dynamic regex patterns in `lineageBuilder.ts`, `schemaExtractor.ts`, and `renderer.ts`.
- **Script tag breakout (P2 security)**: All user-controlled strings in `visualizationPanel.ts` now use `_escapeForInlineScript()` to prevent `</script>` injection.
- **Lint warnings**: Expanded one-line if/else statements to multi-line with braces.

### Security

- **P2 #1-3**: Fixed regex metacharacter escaping in identifier lookups to prevent runtime errors with special characters in table/view names.
- **P2 #4**: Fixed potential script context breakout in webview HTML generation.

---

## [0.1.2] - 2026-01-31

### Added

- **Keyboard shortcut `L`**: Toggle legend panel visibility.
- **Keyboard shortcut `?`**: Show all keyboard shortcuts help dialog.
- **Testing infrastructure**: Jest setup with 414 tests covering parser, renderer, workspace, and lineage modules.

### Changed

- **Toolbar layout**: Responsive design with horizontal scroll on narrow screens instead of overlapping elements.
- **Error badge**: Adjusted positioning to align with new toolbar layout.

### Fixed

- **CTE CASE visualization**: Improved rendering of CASE expressions within CTEs.
- **Error messages**: More descriptive parse error messages with dialect suggestions.

---

## [0.1.1] - 2026-01-30

### Changed

- **README.md**: Fixed keyboard shortcut from `Cmd/Ctrl+Shift+V` to `Cmd/Ctrl+Shift+L` for visualization.
- **README.md**: Added `[` / `]` shortcuts for previous/next query navigation.
- **README.md**: Added Accessibility section with keyboard navigation documentation.
- **README.md**: Expanded Configuration into Core, Workspace, Custom Extensions, Custom Functions, and Advanced sections.
- **README.md**: Added Troubleshooting section with common issues and debug mode.
- **README.md**: Added Architecture Overview with directory structure and data flow.
- **README.md**: Updated roadmap with Phase 5 (polish & accessibility).
- **README.md**: Removed incorrect JSON/DOT export options (not implemented).
- **examples/README.md**: Added `analytics-customer.sql` and `analytics-orders.sql` to file reference.
- **examples/README.md**: Improved feature descriptions and added Pro Tips.

### Fixed

- Keyboard shortcut help: corrected "Previous query" arrow direction from `Q1 → Q2` to `Q2 → Q1`.

---

## [0.1.0] - 2026-01-29

### Added

- **Layout options**: Multiple layout algorithms with dropdown selector (e.g. vertical, horizontal, force-directed).
- **Zoom level indicator** in toolbar showing current zoom percentage.
- **Tooltips** on dialect selector and search input for better discoverability.
- **Keyboard shortcuts dialog** with improved two-column layout.
- **Setting** to combine consecutive DDL statements in visualization.
- **Examples quick reference guide** in `examples/README.md`.

### Changed

- **DDL visualization**: Improved CREATE statement labels with object names; reduced DDL description verbosity.
- **Cloud / CTE layout**: Fixed cloud arrow positioning for all directions; improved expand-all CTE layout with grid-based positioning.
- **Color theming**: Centralized colors in `constants/colors.ts`; panel styles, details panel HTML, SQL clause and legend templates now use theme constants (UI_COLORS, EDGE_COLORS, NODE_COLORS, etc.).
- **SQL validation**: Added validation before visualization — maximum SQL size (100KB) and maximum query count (50) to avoid performance issues or crashes on large/malformed input.

### Fixed

- Panel and template styles now respect dark/light theme via centralized constants.

---

## [0.0.9] - 2026-01-28

### Added

- **Arrow key navigation**: Pan only when the selected node is off-screen; center on node instead of zooming.
- **Keyboard behavior**: Single-click selects without navigating; Ctrl+Click navigates to SQL in editor. Escape key clears focus. Webview keeps focus when zooming/focusing nodes.
- **Focus mode**: Focus upstream/downstream dims nodes instead of hiding them; proper restore when exiting focus mode; ways to exit focused/zoomed view.
- **Search**: Search result count indicator; keyboard node navigation (e.g. next/previous result).
- **Context menu**: Right-click context menu with standardized terminology.
- **Setting**: `showDeadColumnHints` to show or hide dead-column warnings; expanded non-sargable condition detection.

### Changed

- **Node Details panel**: Reduced size for better space efficiency.
- **Code quality**: Addressed multiple code quality issues across the codebase.

### Fixed

- SQL navigation skipped for keyboard-based node selection; `requestAnimationFrame` used for resetView after clearing focus; SVG-specific Escape handler; keyboard events work after clicking on nodes.

---

## [0.0.8] - 2026-01-28

### Added

- **Keyboard shortcuts** for query navigation: `[` and `]` for previous/next query in multi-statement SQL.

### Fixed

- Arrow key navigation centers on node instead of zooming.
- Single-click vs Ctrl+Click selection and SQL navigation behavior.
- Webview focus when zooming/focusing nodes; Escape key handling; keyboard events after node click.
- Focus mode: dim instead of hide, restore on exit, exit controls.

---

## [0.0.7] - 2026-01-27

### Added

- **More SQL commands** supported (e.g. session/utility commands).
- **Configurable file extensions** for SQL file detection.

### Fixed

- **Theme-aware colors** for all UI panels.
- **Column lineage** bug (e.g. `[object Object]` display).
- Leading whitespace in SQL preview for session commands.
- Code quality and security-related issues.

---

## [0.0.6] - 2026-01-27

### Changed

- SQL file detection supports dialect variants and file extension fallback.
- Session/utility commands supported; SQL visualization allowed from any file.
- Consecutive session commands grouped into a single "Session Setup" block; leading comments stripped when detecting session commands.

### Fixed

- Merge and parser updates (node-sql-parser 5.4.0 related).

---

## [0.0.5] - 2026-01-27

### Added

- **Theme toggle**: Dark/light theme support for visualization and UI.
- **Search**: Graph icon, search in visualization, stats improvements.
- **Legend**: Collapsible legend for node types and colors.

### Changed

- Column Lineage panel size reduced for better efficiency.
- Impact analysis: removed redundant ternary expressions.

### Fixed

- Theme-aware colors for panels; column lineage display bug.

---

## [0.0.4] - 2026-01

### Added

- **Session/utility command support**: Commands like `SET`, `USE`, etc. grouped and visualized.
- **Visualize from any file**: No longer restricted to `.sql` only (with configurable extensions).
- **Session Setup block**: Consecutive session commands shown as one block.

### Fixed

- SQL file detection for dialect variants and file extension fallback.
- Parser and dependency updates (node-sql-parser 5.4.0).

---

## [0.0.3] - 2026-01

### Added

- **Demo video** in README and assets.
- **Extension icon** for marketplace and editor.
- **Visualize** option in explorer context menu for `.sql` files.
- **Marketplace metadata**: Publisher, repository URL, installation instructions in README.

### Changed

- `.vscodeignore` updated to exclude unnecessary files.
- Clean up of test files.

### Fixed

- node-sql-parser upgrade to 5.4.0; PNG export fixes.

---

## [0.0.2] - 2026-01

### Added

- **Workspace analysis**: Graph view, Lineage view, Table Explorer, Impact Analysis.
- **Lineage view**: Interactive graph, legend, mini-map, focus modes (upstream/downstream/all).
- **Dark/light theme** for workspace dependencies panel.
- **Export**: PNG, SVG, copy to clipboard; Mermaid export.
- **View location** toggle; pin visualization as separate editor tab.
- **Dialect selector**: MySQL, PostgreSQL, and other dialects via node-sql-parser.
- **Column lineage**: Click column to trace transformation path.

### Changed

- Refactor: Lightweight SVG-based visualization; SQLFlow-style hierarchical layout.
- Process polyfill for webview (`process is not defined` fix).

### Fixed

- ESLint warnings; SQL Flow export and tab switching; graph view context menu and edge highlight; lineage quick filter; line numbers for definitions.

---

## [0.0.1] - 2026-01

### Added

- Initial release.
- **SQL visualization**: Transform SQL into interactive flow diagrams.
- **Execution flow**: Color-coded operation nodes (Table, Filter, Join, Aggregate, Sort, Limit, CTE, Result).
- **Multi-query support**: Tab navigation for multiple statements.
- **CTE & subquery expansion**: Double-click to expand in floating panels.
- **Query statistics**: Complexity score, performance hints.
- **Workspace dependency graph**: Cross-file SQL analysis (Graph, Lineage, Tables, Impact views).

---

[0.2.1]: https://github.com/buva7687/sql-crack/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/buva7687/sql-crack/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/buva7687/sql-crack/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/buva7687/sql-crack/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/buva7687/sql-crack/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/buva7687/sql-crack/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/buva7687/sql-crack/compare/v0.0.9...v0.1.0
[0.0.9]: https://github.com/buva7687/sql-crack/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/buva7687/sql-crack/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/buva7687/sql-crack/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/buva7687/sql-crack/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/buva7687/sql-crack/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/buva7687/sql-crack/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/buva7687/sql-crack/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/buva7687/sql-crack/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/buva7687/sql-crack/releases/tag/v0.0.1
