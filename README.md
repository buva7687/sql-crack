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

### Display & Export

- **View Location Toggle** — Choose where to display: beside editor, new tab, or secondary sidebar
- **Pin Visualizations** — Save query snapshots as separate tabs for comparison
- **Persistent Pins** — Pinned tabs survive VS Code restarts
- **Theme Support** — Dark and light themes with grid pattern background
- **PNG Export** — High-DPI images with background
- **SVG Export** — Vector format for scalable diagrams
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

## Performance Analysis Examples

SQL Crack's static performance analysis detects common optimization opportunities:

### Filter Pushdown
```sql
-- Detected: Filter after JOIN could be applied earlier
SELECT e.name, d.dept_name
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE e.status = 'active';  -- ⬆ Suggestion: Move filter before JOIN
```

### Non-Sargable Expressions
```sql
-- Detected: Function on column prevents index usage
SELECT * FROM employees
WHERE YEAR(hire_date) = 2024;  -- 🚫 Suggestion: Use date range instead
```

### Subquery to JOIN Conversion
```sql
-- Detected: IN subquery could be a JOIN
SELECT * FROM employees
WHERE dept_id IN (SELECT id FROM departments WHERE location = 'NYC');
-- Suggestion: Convert to INNER JOIN
```

### Repeated Table Scans
```sql
-- Detected: Table accessed multiple times
SELECT e1.name,
    (SELECT AVG(salary) FROM employees WHERE dept_id = e1.dept_id),
    (SELECT MAX(salary) FROM employees WHERE dept_id = e1.dept_id)
FROM employees e1;
-- 🔄 Suggestion: Use CTE to scan once
```

### Index Suggestions
```sql
-- Detected: Multiple WHERE conditions
SELECT * FROM employees
WHERE dept_id = 5 AND status = 'active' AND salary > 50000;
-- 📇 Suggestion: Composite index on (dept_id, status, salary)
```

See `examples/example-phase3-performance.sql` for comprehensive test cases.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sqlCrack.defaultDialect` | `MySQL` | Default SQL dialect for parsing |
| `sqlCrack.syncEditorToFlow` | `true` | Highlight nodes when clicking in editor |
| `sqlCrack.viewLocation` | `beside` | Panel location: `beside`, `tab`, or `secondary-sidebar` |

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

```
sql-crack/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── visualizationPanel.ts  # Webview panel management
│   └── webview/
│       ├── index.ts           # UI & interactions
│       ├── sqlParser.ts       # SQL parsing & analysis
│       ├── renderer.ts        # SVG rendering & layout
│       ├── sqlFormatter.ts    # SQL formatting
│       └── performanceAnalyzer.ts  # Phase 3: Static performance analysis
├── package.json
├── tsconfig.json
└── webpack.config.js
```

### Tech Stack

- **VS Code Extension API** — Extension framework
- **TypeScript** — Type-safe development
- **node-sql-parser** — Multi-dialect SQL parsing
- **dagre** — Graph layout algorithm
- **Pure SVG** — Lightweight rendering

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

### 📅 Phase 4: Workspace Awareness (Planned)
- Cross-file lineage tracking (parse SQL files to build dependency graphs)
- dbt integration (parse `ref()`, `source()` macros and YAML configs)
- Workspace-wide table/view dependency visualization

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
