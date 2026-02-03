# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
