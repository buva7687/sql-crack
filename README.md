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

- **Execution Flow Visualization** — See how your SQL query executes step by step
- **Multi-Query Support** — Visualize multiple SQL statements with tab navigation (Q1, Q2, Q3...)
- **Query-Level Column Lineage** — Click any output column to trace its full transformation path from source tables through JOINs, aggregations, and calculations. Highlights relevant nodes and shows step-by-step lineage in a visual timeline.
  
  > **Note:** This is query-level lineage analysis based on SQL parsing — it traces columns within a single query's execution flow. It does not provide object-to-object lineage tracking across your database schema or metadata catalog.

- **Query Statistics** — Complexity score, table/join/filter counts, CTE depth, fan-out analysis, critical path length, complexity breakdown, and performance score (0-100) with color-coded visual indicators

### Interactive Navigation

- **Click Node → Jump to SQL** — Click any node to instantly navigate to its definition in your SQL editor
- **Click Edge → View SQL Clauses** — Click connections to see JOIN conditions, WHERE clauses, and filters with line numbers
- **Breadcrumb Navigation** — Navigate through nested CTEs with an interactive breadcrumb trail showing the query hierarchy
- **Search Nodes** — Find nodes by name with `Ctrl+F` / `Cmd+F`
- **Focus Mode** — Highlight connected nodes for better understanding
- **Bidirectional Editor Sync** — Click in SQL editor to highlight flow nodes, click nodes to jump to SQL
- **Double-Click to Zoom/Expand** — Double-click standard nodes to focus on them and their immediate neighbors; double-click CTE/subquery nodes to open their cloud visualization
- **Enhanced Tooltips** — Hover over nodes to see actual SQL fragments, line numbers, and detailed operation information

### Smart Analysis & Quality

- **Read vs Write Visualization** — Clear visual distinction between data operations:
  - **READ** operations (Blue border + badge)
  - **WRITE** operations (Red border + badge)
  - **DERIVED** tables (Purple border + badge)
- **Operation Type Badges** — See INSERT, UPDATE, DELETE, MERGE, and CREATE TABLE AS operations at a glance
- **Advanced SQL Annotations** — Automatic detection of code quality issues: unused CTEs, dead columns, duplicate subqueries, and repeated table scans with visual warning badges
- **Smart Quality Warnings** — Hover over warning badges to see detailed explanations with severity levels (low/medium/high) and actionable suggestions
- **Static Performance Analysis** — Heuristic-based optimization hints that analyze query structure without database connectivity:
  - Filter pushdown opportunities (filters that could be applied earlier)
  - Join order optimization suggestions
  - Repeated table scan detection
  - Subquery to JOIN conversion opportunities
  - Index usage hints based on query patterns
  - Non-sargable expression detection (functions in WHERE clauses)
  - Aggregate optimization suggestions
  - Performance score (0-100) with issue count
- **Anti-Pattern Detection** — Automatic detection of SQL anti-patterns:

| Issue | Severity |
|-------|----------|
| `SELECT *` usage | Warning |
| Missing `LIMIT` clause | Info |
| `DELETE`/`UPDATE` without `WHERE` | Error |
| Excessive JOINs (5+) | Warning |
| Cartesian products | Error |
| Non-sargable expressions | High |
| Filter after JOIN | Medium |
| Repeated table scans | Medium/High |

### CTE & Subquery Visualization

- **Floating Cloud Design** — CTEs and subqueries display their internal operations in an elegant floating cloud panel with full-size nodes (180x60px) matching the main canvas for complete visibility of table names and operations
- **Double-Click to Open** — Double-click any CTE or subquery node to expand and view its internal flow in the floating cloud panel
- **Dedicated Close Button** — Each cloud has a red X button in the top-right corner for explicit closing (double-click only opens, never closes)
- **Independent Pan & Zoom** — Each cloud container has its own pan and zoom controls:
  - Drag inside the cloud to pan the internal view
  - Scroll wheel inside the cloud to zoom (0.5x to 2x range)
  - Main canvas pan/zoom remains unaffected
- **Draggable Cloud Positioning** — Drag the cloud container by its border to reposition it anywhere on the canvas; the connecting arrow automatically adjusts to the correct side
- **Full Tooltips in Cloud** — Hover over any node inside the cloud to see detailed tooltips with SQL fragments, line numbers, and operation details
- **Default Collapsed** — CTEs and subqueries start collapsed by default to reduce visual clutter; expand on demand to explore their internal structure
- **Expand All Shortcut** — Press `E` to expand or collapse all CTEs and subqueries at once; clouds are automatically stacked vertically to prevent overlap

### Layout & Focus

- **Layout Toggle** — Switch between vertical (top-to-bottom) and horizontal (left-to-right) graph layouts with `H` key
- **Focus Mode** — Filter node visibility based on data flow direction:
  - `U` — Show only upstream nodes (data sources feeding into selected node)
  - `D` — Show only downstream nodes (nodes that consume selected node's output)
  - `A` — Show all connected nodes (both directions)
- **Auto-Refresh** — Visualization automatically updates as you edit SQL (500ms debounce)
- **Stale Indicator** — Visual indicator when visualization is out of sync with editor

### Display & Export

- **View Location Toggle** — Choose where to display: beside editor, new tab, or secondary sidebar
- **Pin Visualizations** — Save query snapshots as separate tabs for comparison
- **Persistent Pins** — Pinned tabs survive VS Code restarts
- **Theme Support** — Dark and light themes with grid pattern background
- **PNG Export** — High-DPI images with background
- **SVG Export** — Vector format for scalable diagrams
- **Mermaid Export** — Export as Mermaid.js flowchart (`.md` file with mermaid code block)
- **Clipboard Copy** — Quick sharing via clipboard

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

Analyze cross-file dependencies across your entire SQL project:

1. **From Explorer**: Right-click any folder → **"SQL Crack: Analyze Workspace Dependencies"**
2. **From Command Palette**: Press `Cmd/Ctrl + Shift + P` → **"SQL Crack: Analyze Workspace Dependencies"**

The workspace panel includes multiple views for comprehensive analysis:

#### **Graph View** (Default)
- Visualize dependency graph with file and table nodes
- Color-coded nodes: Blue (files), Green (tables), Purple (views), Grey (external)
- Color-coded edges: SELECT (grey), JOIN (purple), INSERT (green), UPDATE (yellow), DELETE (red)
- Pan by dragging, zoom with mouse wheel
- Click nodes to open files, hover for detailed tooltips

#### **Lineage View** 📈
- Search and explore data lineage across tables and views
- Visual graph showing upstream and downstream data flow
- Interactive node exploration with click-to-trace
- Filter by object type (Tables, Views, CTEs)
- Real-time search with debounced input
- Statistics: tables, views, CTEs, relationships count

#### **Table Explorer** 📊
- Browse all tables and views in the workspace
- See detailed schema information (columns, types, constraints)
- View reference counts and usage locations
- Filter by file or table name
- One-click navigation to definitions and references

#### **Impact Analysis** 🎯
- Analyze the impact of proposed table or column changes
- See direct and transitive dependencies
- Change type simulation: MODIFY, RENAME, DROP
- Severity indicators: HIGH, MEDIUM, LOW
- Affected files with line numbers

**Common Interactions** (all views):
- Click any file/table node to open it in the editor
- Double-click to visualize that file's SQL query
- Hover for details on definitions and references
- Use the search box to filter nodes by name
- Pan and zoom with intuitive controls
- Pan by dragging, zoom with mouse wheel
- Click **Legend** button for color-coded guide

**Graph Visualization**:
- Hierarchical layout with automatic node positioning
- Color-coded nodes: Blue (files), Green (tables), Purple (views), Grey (external)
- Color-coded edges: Grey (SELECT), Purple (JOIN), Green (INSERT), Yellow (UPDATE), Red (DELETE)
- Smooth curved bezier edges with proper spacing
- Centered layout with dynamic row wrapping
- Row centering for optimal visual balance

**Search**:
- Search nodes by name with `Ctrl+F` / `Cmd+F`
- Filter by node type (Files, Tables, Views, External)
- Enable regex matching with `.*` button
- Toggle case sensitivity with `Aa` button
- Debounced search (300ms) for optimal performance

**Statistics Panel**:
- Total files, tables, views analyzed
- Reference count
- **Click orphaned/missing badges** to expand detailed lists:
  - Orphaned definitions show file path and line number for each unused table/view
  - Missing definitions show all files referencing each undefined table
  - Click any item to navigate directly to the source

**Incremental Parsing**:
- SHA-256 content hashing for reliable change detection
- Only reprocesses files that have actually changed
- Persistent index survives VS Code restarts
- Automatic updates on file save with 1-second debounce

### Interactive Features

- **Navigate to SQL**: Click any node to jump to its definition in the editor
- **View SQL Clauses**: Click edge connections to see JOIN conditions and WHERE clauses
- **Navigate CTEs**: Use the breadcrumb trail at the top to navigate through nested Common Table Expressions
- **Expand CTEs & Subqueries**: Double-click any CTE or subquery node to open its floating cloud panel with full-size nodes; use the X button to close
- **Cloud Navigation**: Pan and zoom independently within cloud containers; drag clouds by their border to reposition
- **View Details**: Hover over any node (including those inside clouds) to see SQL fragments and line numbers
- **Zoom & Pan**: Use mouse wheel to zoom, drag to pan, or double-click standard nodes to focus on them and their neighbors
- **Performance Hints**: View categorized optimization hints with filter controls for Performance, Quality, Best Practice, and Complexity categories
- **Filter Hints**: Click category or severity buttons to filter hints by type or severity level (High/Medium/Low)

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

| Node Type | Color | Description | Badges |
|-----------|-------|-------------|--------|
| Table | Blue | Source tables | READ (Blue), WRITE (Red), DERIVED (Purple) |
| Filter | Purple | WHERE/HAVING conditions | — |
| Join | Pink | JOIN operations | — |
| Aggregate | Amber | SUM, COUNT, AVG, etc. | — |
| Window | Fuchsia | Window functions | — |
| Select | Indigo | Column projection | — |
| Sort | Green | ORDER BY | — |
| Limit | Cyan | LIMIT clause | — |
| CTE | Purple | Common Table Expressions | CTE (Purple) |
| Result | Green | Query output | — |

**Operation Badges**: INSERT (Green), UPDATE (Amber), DELETE (Dark Red), MERGE (Violet), CREATE TABLE AS (Cyan)

**Performance Warning Icons**: Filter Pushdown (⬆), Non-Sargable (🚫), Join Order (⇄), Index Suggestion (📇), Repeated Scan (🔄), Complex (🧮)

## Performance Analysis

SQL Crack provides heuristic-based static performance analysis to identify optimization opportunities:

- **Filter Pushdown** — Identifies WHERE conditions that could be applied earlier
- **Join Order** — Suggests optimal join ordering based on heuristics
- **Repeated Scans** — Detects multiple table accesses in single query
- **Subquery to JOIN** — Finds conversion opportunities for IN/EXISTS subqueries
- **Index Hints** — Suggests indexes based on WHERE, JOIN, and GROUP BY patterns
- **Non-Sargable Expressions** — Detects functions in WHERE clauses that prevent index usage
- **Aggregate Optimization** — Identifies COUNT(DISTINCT) and HAVING issues
- **Performance Score** — Calculates 0-100 score based on detected issues

> **Note**: This is static analysis based on SQL parsing. For production optimization, always test with actual query plans (`EXPLAIN ANALYZE`).

**For detailed examples**, see [`examples/PERFORMANCE_EXAMPLES.md`](examples/PERFORMANCE_EXAMPLES.md) and the example SQL files in the `examples/` directory.

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

## Recent Improvements

### 🎨 UI Consistency Refactoring (January 2026)
Major refactoring to improve code maintainability and UI consistency:

- **Modular Architecture**: Extracted 6,047-line monolith into 5 focused modules
- **Shared View Templates**: Created reusable view container with consistent header, stats, controls, and content structure
- **Unified Styling**: 364 lines of shared styles for all view modes (Graph, Lineage, Table Explorer, Impact)
- **Code Reduction**: 65% reduction in main file with improved testability and maintainability
- **Zero Regressions**: All functionality preserved with zero compilation errors

**View Mode Enhancements**:
- Consistent icon + title + subtitle headers across all tabs
- Standardized stat badges with values and labels
- Unified search and filter controls with focus states
- Improved visual hierarchy and spacing
- Enhanced accessibility with keyboard navigation

## Roadmap

SQL Crack follows a phased development approach focused on delivering professional-grade SQL visualization features:

### ✅ Phase 1: Core Professional Features (COMPLETED)
- ✅ Enhanced interactive navigation (click-to-jump, edge highlighting, breadcrumbs)
- ✅ Read vs Write differentiation with visual badges
- ✅ Enhanced tooltips with SQL fragments and line numbers
- ✅ CTE expansion controls with breadcrumb navigation
- ✅ Fullscreen mode with UI element hiding
- ✅ Click-to-jump navigation with source document tracking
- ✅ Edge click to view SQL clauses (JOIN/WHERE conditions)

### ✅ Phase 2: Developer Productivity & Quality (COMPLETED)
- ✅ Advanced SQL annotations and warnings (unused CTEs, dead columns, duplicate subqueries, repeated table scans)
- ✅ Query complexity insights (CTE depth, fan-out analysis, critical path length, complexity breakdown)
- ✅ Smart quality warnings with severity levels and actionable suggestions
- ✅ Query-level column lineage visualization (click-to-trace with full transformation path)
- ✅ Floating cloud design for CTE and subquery visualization with full-size nodes matching main canvas
- ✅ Independent pan/zoom within cloud containers for complex subquery navigation
- ✅ Draggable cloud positioning with dynamic arrow adjustment
- ✅ Dedicated close button (X) for explicit cloud dismissal
- ✅ Enhanced CTE parsing to handle various AST structures from node-sql-parser
- 📅 Diff-aware visualization for PR reviews (Planned)

### ✅ Phase 3: Static Performance Analysis (COMPLETED)
- ✅ Filter pushdown detection — Identifies WHERE conditions that could be applied earlier in query execution
- ✅ Join order optimization hints — Suggests optimal join ordering based on heuristics (filtered tables first, CROSS JOINs last)
- ✅ Repeated table scan detection — Identifies when the same table is accessed multiple times unnecessarily
- ✅ Subquery to JOIN conversion — Detects IN, EXISTS, and scalar subqueries that could be rewritten as JOINs
- ✅ Index usage hints — Suggests columns that would benefit from indexes based on WHERE, JOIN, ORDER BY, and GROUP BY patterns
- ✅ Non-sargable expression detection — Detects functions in WHERE clauses (YEAR(), UPPER(), etc.) and LIKE patterns with leading wildcards that prevent index usage
- ✅ Aggregate optimization hints — Identifies COUNT(DISTINCT), HAVING without aggregates, and missing WHERE filters before aggregation
- ✅ Performance score calculation — Provides a 0-100 performance score based on detected issues
- ✅ Categorized hints panel — Performance hints grouped by category (Performance, Quality, Best Practice, Complexity) with filter controls
- ✅ Node decorations — Visual warning badges on nodes for performance issues (filter pushdown, non-sargable, join order, index suggestions)

> **Note:** True query plan analysis and cost-based optimization require database connectivity, which is outside the scope of this local-only tool. Phase 3 provides heuristic-based static analysis that works without database access.

### ✅ Phase 4: Workspace Awareness (COMPLETED)
- ✅ Cross-file lineage tracking — Parse all SQL files in workspace to build dependency graphs
- ✅ Schema extraction — AST-based extraction of CREATE TABLE/VIEW definitions with column details
- ✅ Reference extraction — Track all table references across SELECT, INSERT, UPDATE, DELETE, and JOIN operations
- ✅ Dependency graph visualization — Interactive webview with 4 visualization modes:
  - **Graph View**: Dependency graph with file and table nodes, color-coded edges
  - **Lineage View**: Interactive data lineage exploration with search and filters
  - **Table Explorer**: Browse all tables/views with schema details and references
  - **Impact Analysis**: Analyze change impact across workspace dependencies
- ✅ Workspace statistics — Total files, tables, views, references, orphaned/missing definitions
- ✅ Persistent index — Incremental indexing with automatic updates on file changes
- ✅ Interactive exploration — Click to open file, double-click to visualize, hover for details
- ✅ Pan and zoom — Navigate large workspace graphs with intuitive controls
- ✅ Auto-index threshold — Configurable threshold for large workspaces (default: 50 files)
- ✅ Explorer integration — Right-click folder to analyze workspace dependencies
- 📅 dbt integration — Parse `ref()`, `source()` macros and YAML configs (Planned)

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
