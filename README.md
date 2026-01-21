<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-1.85+-blue?logo=visualstudiocode" alt="VS Code">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs Welcome">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
</p>

<h1 align="center">SQL Crack</h1>

<p align="center">
  <strong>Transform SQL queries into interactive visual flow diagrams</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#contributing">Contributing</a>
</p>

---

SQL Crack is a VS Code extension that visualizes SQL queries as interactive execution flow diagrams. Understand complex queries at a glance, track column lineage, and identify optimization opportunities with professional-grade visual analysis.

> Inspired by [JSON Crack](https://jsoncrack.com/) and Snowflake Query Profile

<!-- Add screenshot/GIF here -->
<!-- ![SQL Crack Demo](./assets/demo.gif) -->

## Features

### Core Visualization
- **Execution Flow** — See how your SQL query executes step by step
- **Multi-Query Support** — Visualize multiple SQL statements with tab navigation (Q1, Q2, Q3...)
- **Query-Level Column Lineage** — Click any output column to trace its full transformation path from source tables through JOINs, aggregations, and calculations
- **Query Statistics** — Complexity score, CTE depth, fan-out analysis, performance score (0-100), and more

### Interactive Navigation
- **Click to Navigate** — Click nodes to jump to SQL, click edges to view JOIN/WHERE clauses
- **Breadcrumb Trail** — Navigate through nested CTEs with interactive breadcrumbs
- **Search** — Find nodes by name with `Ctrl+F` / `Cmd+F`
- **Editor Sync** — Bidirectional highlighting between editor and flow diagram
- **Focus Mode** — Filter visibility to show upstream (`U`), downstream (`D`), or all (`A`) connected nodes

### Smart Analysis
- **Read vs Write** — Visual distinction: READ (Blue), WRITE (Red), DERIVED (Purple)
- **Quality Warnings** — Automatic detection of unused CTEs, dead columns, duplicate subqueries, and repeated table scans
- **Performance Hints** — Heuristic-based optimization suggestions: filter pushdown, join order, index usage, non-sargable expressions, and more
- **Performance Score** — 0-100 score based on detected anti-patterns

### CTE & Subquery Visualization
- **Floating Cloud Panels** — Double-click CTEs to expand internal operations in floating panels
- **Independent Navigation** — Pan and zoom within cloud containers (0.5x-2x)
- **Draggable Positioning** — Drag clouds to reposition; connecting arrows auto-adjust
- **Expand All** — Press `E` to expand/collapse all CTEs at once

### Layout & Export
- **Layout Toggle** — Switch between vertical and horizontal layouts
- **Auto-Refresh** — Updates automatically as you edit (500ms debounce)
- **Export Options** — PNG, SVG, Mermaid.js, or clipboard copy
- **View Modes** — Display beside editor, in tab, or secondary sidebar
- **Pin Visualizations** — Save snapshots as persistent tabs

## Supported Dialects

MySQL • PostgreSQL • SQL Server • MariaDB • SQLite • Snowflake • BigQuery • Redshift • Hive • Athena • Trino

## Installation

### VS Code Marketplace

```
ext install sql-crack
```

Or search for **"SQL Crack"** in the VS Code Extensions panel.

### From Source

```bash
git clone https://github.com/user/sql-crack.git
cd sql-crack
npm install
npm run package
```

Then install the generated `.vsix` file via **Extensions → ••• → Install from VSIX**.

## Usage

### Quick Start

1. Open any `.sql` file
2. Visualize using one of:
   - Click the **graph icon** in the editor title bar
   - Press `Cmd+Shift+V` (Mac) / `Ctrl+Shift+V` (Windows/Linux)
   - Right-click → **"SQL Crack: Visualize SQL Query"**

### Workspace Analysis

Analyze cross-file dependencies across your entire SQL project via:
- Right-click folder → **"SQL Crack: Analyze Workspace Dependencies"**
- Command Palette → **"SQL Crack: Analyze Workspace Dependencies"**

**Four Analysis Modes**:
- **Graph View** — Dependency graph with file/table nodes, color-coded edges (SELECT/JOIN/INSERT/UPDATE/DELETE)
- **Lineage View** — Explore data lineage across tables and views with search and filters
- **Table Explorer** — Browse all tables/views with schema details and references
- **Impact Analysis** — Analyze change impact (MODIFY/RENAME/DROP) with severity indicators

**Common Interactions** (all views):
- Click nodes to open files, double-click to visualize SQL
- Pan/zoom navigation, search with regex and case-sensitivity options
- Statistics panel showing files, tables, views, and references
- Orphaned/missing definition badges with click-to-navigate

**Incremental Parsing**: SHA-256 hashing, persistent index, auto-update on file save

### Interactive Features

Click nodes to jump to SQL, edges to view clauses, hover for tooltips. Double-click CTEs for cloud panels. View categorized hints with filters.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + V` | Open visualization |
| `Cmd/Ctrl + F` | Search nodes |
| `Enter` / `↓` | Next search result |
| `↑` | Previous search result |
| `Escape` | Clear selection |
| `C` | Toggle column lineage mode |
| `L` | Toggle legend |
| `S` | Toggle SQL preview |
| `Q` | Toggle query stats panel |
| `H` | Toggle layout (vertical/horizontal) |
| `U` | Focus upstream nodes only |
| `D` | Focus downstream nodes only |
| `A` | Focus all connected nodes |
| `E` | Expand/collapse all CTEs & subqueries |
| `T` | Toggle theme |
| `F` | Toggle fullscreen |
| `?` | Show all shortcuts |

### Node Types & Visual Indicators

**Node Colors**: Table (Blue), Filter (Purple), Join (Pink), Aggregate (Amber), Window (Fuchsia), Select (Indigo), Sort (Green), Limit (Cyan), CTE (Purple), Result (Green)

**Badges**: READ/WRITE/DERIVED (Blue/Red/Purple), INSERT/UPDATE/DELETE/MERGE (Green/Amber/Dark Red/Violet)

**Performance Icons**: Filter Pushdown (⬆), Non-Sargable (🚫), Join Order (⇄), Index Suggestion (📇), Repeated Scan (🔄), Complex (🧮)

## Performance Analysis

Heuristic-based static analysis identifies optimization opportunities: filter pushdown, join order, repeated scans, subquery-to-JOIN conversion, index hints, non-sargable expressions, and aggregate optimization. Calculates 0-100 performance score.

> **Note**: This is static analysis based on SQL parsing. For production optimization, test with actual query plans (`EXPLAIN ANALYZE`). See [`examples/PERFORMANCE_EXAMPLES.md`](examples/PERFORMANCE_EXAMPLES.md) for detailed examples.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sqlCrack.defaultDialect` | `MySQL` | Default SQL dialect for parsing |
| `sqlCrack.syncEditorToFlow` | `true` | Highlight nodes when clicking in editor |
| `sqlCrack.viewLocation` | `beside` | Panel location: `beside`, `tab`, or `secondary-sidebar` |
| `sqlCrack.defaultLayout` | `vertical` | Default graph layout direction: `vertical` (top-to-bottom) or `horizontal` (left-to-right) |
| `sqlCrack.autoRefresh` | `true` | Auto-refresh visualization when SQL changes |
| `sqlCrack.autoRefreshDelay` | `500` | Debounce delay in milliseconds (100-5000) |
| `sqlCrack.workspaceAutoIndexThreshold` | `50` | Maximum number of SQL files to auto-index on workspace analysis (10-500) |

## Privacy

- **100% Local** — All processing happens in VS Code
- **No Network Calls** — Your SQL never leaves your machine
- **No Telemetry** — Zero data collection
- **Open Source** — Fully auditable code

## Development

```bash
npm install          # Install dependencies
npm run compile      # Build extension
npm run watch        # Watch mode
npm run typecheck    # Type check
npm run lint         # Lint code
```

Press `F5` to launch the Extension Development Host.

### Architecture

The workspace module has been refactored into a modular, maintainable architecture:

```
src/workspace/
├── workspacePanel.ts (2,134 lines) — Main orchestration
├── handlers/
│   ├── messageHandler.ts (784 lines) — Webview message handling
│   └── index.ts — Barrel export
├── ui/
│   ├── sharedStyles.ts (2,623 lines) — All CSS (design tokens, components)
│   ├── clientScripts.ts (1,839 lines) — All JavaScript (interactivity)
│   ├── graphView.ts (330 lines) — Graph HTML generation
│   ├── tableExplorer.ts — Table browsing UI
│   ├── lineageView.ts — Lineage visualization
│   ├── impactView.ts — Impact analysis UI
│   └── types.ts — Type definitions
├── extraction/ — SQL parsing and schema extraction
├── lineage/ — Data lineage tracking and analysis
└── dependencyGraph.ts — Dependency graph construction
```

**Refactoring Benefits**:
- **65% code reduction** in main file (6,047 → 2,134 lines)
- **Clear separation of concerns** (CSS, JS, HTML, Logic)
- **Reusable components** with consistent UI across all views
- **Dependency injection** for testable, decoupled code
- **Zero TypeScript errors** with full type safety

## Roadmap

SQL Crack follows a phased development approach:

- ✅ **Phase 1** — Core professional features (interactive navigation, tooltips, CTE expansion, fullscreen)
- ✅ **Phase 2** — Developer productivity (quality warnings, complexity insights, column lineage, cloud panels)
- ✅ **Phase 3** — Static performance analysis (filter pushdown, join order, index hints, anti-pattern detection)
- ✅ **Phase 4** — Workspace awareness (cross-file lineage, schema extraction, dependency graph, 4 view modes)

**Planned**: Diff-aware visualization for PR reviews, dbt integration (`ref()`, `source()` macros)

## Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/user/sql-crack/issues) with:

- Clear description of the problem/feature
- Steps to reproduce (for bugs)
- SQL query example (if applicable)
- VS Code and extension version

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- [JSON Crack](https://jsoncrack.com/) — Visual inspiration
- [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) — SQL parsing
- [dagre](https://github.com/dagrejs/dagre) — Graph layout

---

<p align="center">
  Made with SQL for the SQL community
</p>
