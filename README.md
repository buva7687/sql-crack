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
  <a href="#supported-dialects">Dialects</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#contributing">Contributing</a>
</p>

---

SQL Crack is a VS Code extension that visualizes SQL queries as interactive execution flow diagrams. Understand complex queries at a glance, track data lineage across your entire workspace, and identify optimization opportunities with professional-grade visual analysis.

> Inspired by [JSON Crack](https://jsoncrack.com/) and Snowflake Query Profile

<!-- ![SQL Crack Demo](./assets/demo.gif) -->

## Features

### Query Visualization

| Feature | Description |
|---------|-------------|
| **Execution Flow** | See how your SQL executes step-by-step with color-coded operation nodes |
| **Multi-Query Support** | Visualize multiple statements with tab navigation (Q1, Q2, Q3...) |
| **Column Lineage** | Click any output column to trace its transformation path through JOINs, aggregations, and calculations |
| **CTE & Subquery Expansion** | Double-click to expand CTEs/subqueries in floating cloud panels with independent pan/zoom |
| **Query Statistics** | Complexity score, CTE depth, fan-out analysis, and performance score (0-100) |

**Node Types**: Table (Blue) • Filter (Purple) • Join (Pink) • Aggregate (Amber) • Window (Fuchsia) • Sort (Green) • Limit (Cyan) • CTE (Purple) • Result (Green)

**Operation Badges**: READ (Blue) • WRITE (Red) • DERIVED (Purple) • INSERT (Green) • UPDATE (Amber) • DELETE (Dark Red) • MERGE (Violet)

---

### Workspace Analysis

Analyze cross-file dependencies across your entire SQL project with four powerful views:

#### Graph View
Dependency graph showing file and table relationships with color-coded edges for SELECT, JOIN, INSERT, UPDATE, and DELETE operations.

#### Lineage View
Explore data lineage across tables, views, and CTEs with:
- **Interactive Graph** — Animated flow edges showing data direction
- **Legend Panel** — Collapsible reference for node types and column colors
- **Mini-Map** — Overview panel for navigating large graphs
- **Column Type Colors** — Primary (Gold), Numeric (Blue), Text (Green), DateTime (Purple), JSON (Teal)
- **Focus Modes** — View upstream only (`U`), downstream only (`D`), or all connections (`A`)

#### Table Explorer
Browse all tables and views with schema details, column information, and cross-references.

#### Impact Analysis
Analyze change impact (MODIFY/RENAME/DROP) with severity indicators and affected dependencies.

**Common Features** (all views):
- Click nodes to open files, double-click to visualize SQL
- Pan/zoom navigation with search (regex and case-sensitivity options)
- Statistics panel showing files, tables, views, and references
- Orphaned/missing definition badges with click-to-navigate
- Incremental parsing with SHA-256 hashing and auto-update on save

---

### Smart Analysis

| Analysis | Description |
|----------|-------------|
| **Quality Warnings** | Unused CTEs, dead columns, duplicate subqueries, repeated table scans |
| **Performance Hints** | Filter pushdown, join order, index suggestions, non-sargable expressions |
| **Performance Score** | 0-100 score based on detected anti-patterns |

**Performance Icons**: Filter Pushdown (⬆) • Non-Sargable (🚫) • Join Order (⇄) • Index Suggestion (📇) • Repeated Scan (🔄) • Complex (🧮)

> **Note**: This is heuristic-based static analysis. For production optimization, validate with actual query plans (`EXPLAIN ANALYZE`).

---

### Interactive Navigation

- **Click to Navigate** — Click nodes to jump to SQL source, click edges to view JOIN/WHERE clauses
- **Breadcrumb Trail** — Navigate through nested CTEs with clickable breadcrumbs
- **Search** — Find nodes by name with `Cmd/Ctrl + F`
- **Editor Sync** — Bidirectional highlighting between editor and flow diagram
- **Hover Tooltips** — Detailed information on hover for nodes and edges

---

### Layout & Export

- **Layout Toggle** — Switch between vertical (top-down) and horizontal (left-right) layouts
- **Auto-Refresh** — Updates automatically as you edit (configurable debounce)
- **Export Options** — PNG, SVG, Mermaid.js, or clipboard copy
- **View Modes** — Display beside editor, in tab, or secondary sidebar
- **Pin Visualizations** — Save snapshots as persistent tabs
- **Fullscreen** — Press `F` for distraction-free viewing

---

## Supported Dialects

MySQL • PostgreSQL • SQL Server • MariaDB • SQLite • Snowflake • BigQuery • Redshift • Hive • Athena • Trino

---

## Installation

### From Source

```bash
git clone https://github.com/buva7687/sql-crack.git
cd sql-crack
npm install
npm run package
```

Install the generated `.vsix` file via **Extensions → ••• → Install from VSIX**.

---

## Usage

### Quick Start

1. Open any `.sql` file
2. Visualize using one of:
   - Click the **graph icon** in the editor title bar
   - Press `Cmd+Shift+V` (Mac) / `Ctrl+Shift+V` (Windows/Linux)
   - Right-click → **"SQL Crack: Visualize SQL Query"**

### Workspace Analysis

Analyze cross-file dependencies:
- Right-click folder → **"SQL Crack: Analyze Workspace Dependencies"**
- Command Palette → **"SQL Crack: Analyze Workspace Dependencies"**

---

## Keyboard Shortcuts

### Query Visualization

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + V` | Open visualization |
| `Cmd/Ctrl + F` | Search nodes |
| `Enter` / `↓` | Next search result |
| `↑` | Previous search result |
| `Escape` | Clear selection |
| `C` | Toggle column lineage |
| `L` | Toggle legend |
| `S` | Toggle SQL preview |
| `Q` | Toggle query stats |
| `H` | Toggle layout direction |
| `E` | Expand/collapse all CTEs |
| `T` | Toggle theme |
| `F` | Toggle fullscreen |
| `?` | Show all shortcuts |

### Lineage View

| Shortcut | Action |
|----------|--------|
| `U` | Focus upstream only |
| `D` | Focus downstream only |
| `A` | Show all connections |
| `C` | Toggle column details |
| `Scroll` | Zoom in/out |
| `Drag` | Pan the view |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sqlCrack.defaultDialect` | `MySQL` | SQL dialect for parsing |
| `sqlCrack.syncEditorToFlow` | `true` | Highlight nodes when clicking in editor |
| `sqlCrack.viewLocation` | `beside` | Panel location: `beside`, `tab`, `secondary-sidebar` |
| `sqlCrack.defaultLayout` | `vertical` | Graph direction: `vertical` or `horizontal` |
| `sqlCrack.autoRefresh` | `true` | Auto-refresh on SQL changes |
| `sqlCrack.autoRefreshDelay` | `500` | Debounce delay in ms (100-5000) |
| `sqlCrack.workspaceAutoIndexThreshold` | `50` | Max files to auto-index (10-500) |

---

## Privacy

- **100% Local** — All processing happens in VS Code
- **No Network Calls** — Your SQL never leaves your machine
- **No Telemetry** — Zero data collection
- **Open Source** — Fully auditable code

---

## Development

```bash
npm install          # Install dependencies
npm run compile      # Build extension
npm run watch        # Watch mode
npm run typecheck    # Type check
npm run lint         # Lint code
```

Press `F5` to launch the Extension Development Host.

---

## Roadmap

- ✅ **Phase 1** — Core visualization (execution flow, CTE expansion, fullscreen)
- ✅ **Phase 2** — Developer productivity (quality warnings, column lineage, cloud panels)
- ✅ **Phase 3** — Performance analysis (filter pushdown, join order, anti-pattern detection)
- ✅ **Phase 4** — Workspace analysis (cross-file lineage, dependency graph, 4 view modes)

**Planned**: Diff-aware visualization for PR reviews, dbt integration (`ref()`, `source()` macros)

---

## Contributing

Contributions are welcome!

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/buva7687/sql-crack/issues) with:

- Clear description of the problem/feature
- Steps to reproduce (for bugs)
- SQL query example (if applicable)
- VS Code and extension version

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [JSON Crack](https://jsoncrack.com/) — Visual inspiration
- [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) — SQL parsing
- [dagre](https://github.com/dagrejs/dagre) — Graph layout

---

<p align="center">
  Made with SQL for the SQL community
</p>
