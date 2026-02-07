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
- `npx jest --silent` — Run all tests (currently 663 tests, 39 suites)
- `npx jest path/to/test` — Run specific test
- `vsce package` — Build VSIX

## Conventions
- Commit messages: `fix(scope): description` or `feat(scope): description`
- Always run `tsc --noEmit` and `jest` before committing
- When fixing UI/UX issues, grep for related hardcoded values across the entire codebase before marking done
- SVG elements use `fill`/`stroke` attributes; CSS can override these with higher specificity
