# SQL Crack

**Visualize SQL queries with interactive flow diagrams**

SQL Crack is a lightweight Visual Studio Code extension that transforms SQL queries into clear, interactive execution flow visualizations. Inspired by Snowflake Query Profile and JSON Crack, it helps you understand complex queries at a glance.

## Features

### Core Visualization
- **Execution Flow Visualization** - See how your SQL query executes step by step
- **Multiple Query Support** - Visualize multiple SQL statements with tab navigation
- **Interactive Nodes** - Click nodes to view details, double-click to zoom
- **Node Search** - Search nodes by name (Ctrl+F / Cmd+F)
- **Query Statistics** - Complexity score, table/join/filter counts
- **Optimization Hints** - Automatic detection of common SQL anti-patterns
- **Pan & Zoom** - Navigate with mouse drag and scroll wheel
- **Multi-Dialect Support** - MySQL, PostgreSQL, SQL Server, MariaDB, SQLite, Snowflake, BigQuery, Redshift, Hive, Athena, Trino
- **Export Options** - PNG, SVG, or copy to clipboard

### Advanced Features
- **SQL Diff Tool** - Compare two SQL queries side-by-side with syntax highlighting
- **SQL Formatter** - Format and syntax-highlight SQL code in preview panel
- **Pinned Tabs** - Pin multiple visualizations for easy comparison
- **Theme Toggle** - Switch between dark and light themes
- **Fullscreen Mode** - View visualizations in fullscreen
- **Focus Mode** - Highlight connected nodes for better understanding
- **Column Lineage** - Track column sources through the query pipeline
- **Editor Sync** - Click in SQL editor to highlight corresponding nodes in visualization

## New Features

### Batch Processing
- Visualize multiple SQL statements in one file
- Tab navigation between queries (Q1, Q2, Q3...)
- Error queries highlighted in red
- Hover over tabs to see SQL preview

### Query Statistics Panel
- **Complexity Score** - Simple, Moderate, Complex, Very Complex
- **Metrics** - Tables, Joins, Filters, CTEs, Subqueries, Window Functions
- Color-coded badges for quick assessment

### Optimization Hints
Automatic detection of:
- `SELECT *` usage (performance warning)
- Missing `LIMIT` clause (info)
- `DELETE`/`UPDATE` without `WHERE` (error)
- Too many JOINs (warning)
- Multiple subqueries (warning)
- Cartesian products (error)

### Enhanced Interactivity
- **Search nodes** - Ctrl+F to search, Enter/Arrow keys for navigation
- **Edge highlighting** - Hover/click nodes to highlight connected edges
- **Zoom to node** - Double-click any node to zoom in
- **Keyboard shortcuts** - Escape to clear selection, multiple shortcuts available (press ? for help)
- **SQL Preview Panel** - View formatted SQL with syntax highlighting (S key)
- **Legend Panel** - Color-coded legend for node types (L key)

### Export & Sharing
- **PNG** - High-DPI export with background
- **SVG** - Vector format for scalable diagrams
- **Clipboard** - Copy diagram directly to clipboard

## Supported SQL Features

| Feature | Support |
|---------|---------|
| SELECT queries | Full |
| JOINs (INNER, LEFT, RIGHT, FULL) | Full |
| WHERE conditions | Full |
| GROUP BY / HAVING | Full |
| ORDER BY | Full |
| LIMIT | Full |
| CTEs (WITH clause) | Full |
| Subqueries | Full |
| UNION / INTERSECT / EXCEPT | Full |
| Window functions | Full |
| INSERT / UPDATE / DELETE | Basic |

## Installation

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd sql-crack

# Install dependencies
npm install

# Build the extension
npm run package

# Install the VSIX file in VS Code
# Extensions panel -> ... -> Install from VSIX
```

### Development

```bash
npm install        # Install dependencies
npm run compile    # Development build (webpack in development mode)
npm run watch      # Watch mode for development (auto-rebuild on changes)
npm run package    # Production build (webpack in production mode, creates .vsix)
npm run typecheck  # Type check TypeScript code (tsc --noEmit)
npm run lint       # Lint code with ESLint
```

Press **F5** in VS Code to launch the Extension Development Host with the extension loaded.

## Usage

1. Open any `.sql` file in VS Code
2. Use one of these methods to visualize:
   - Click the **graph icon** in the editor title bar
   - Right-click and select **"SQL Crack: Visualize SQL Query"**
   - Press **`Cmd+Shift+V`** (Mac) or **`Ctrl+Shift+V`** (Windows/Linux)
   - Command Palette: **"SQL Crack: Visualize SQL Query"**

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + V` | Open/trigger visualization |
| `Cmd/Ctrl + F` | Focus search box |
| `Enter` / `↓` | Next search result |
| `↑` | Previous search result |
| `Escape` | Clear selection / search / close modals |
| `L` | Toggle legend panel |
| `S` | Toggle SQL preview panel |
| `T` | Toggle dark/light theme |
| `F` | Toggle fullscreen mode |
| `D` | Open SQL diff modal |
| `?` | Show keyboard shortcuts help |
| Mouse wheel | Zoom in/out |
| Mouse drag | Pan canvas |
| Double-click | Zoom to node |

### Tips

- **Select specific SQL** to visualize just that portion
- **Change dialect** using the dropdown in the toolbar
- **Click nodes** to see operation details in the side panel
- **Hover tabs** to preview SQL for each query

## Node Types & Colors

| Node Type | Color | Description |
|-----------|-------|-------------|
| Table | Blue | Source tables |
| Filter | Purple | WHERE/HAVING conditions |
| Join | Pink | JOIN operations |
| Aggregate | Amber | GROUP BY operations |
| Window | Fuchsia | Window functions |
| Select | Indigo | Column projection |
| Sort | Green | ORDER BY operations |
| Limit | Cyan | LIMIT clause |
| Result | Green | Query output |
| CTE | Purple | Common Table Expressions |
| Union | Orange | Set operations |
| Subquery | Teal | Nested queries |

## Architecture

```
sql-crack/
├── src/
│   ├── extension.ts          # VS Code extension entry point
│   ├── visualizationPanel.ts # Webview panel management & VS Code API integration
│   ├── types.d.ts            # Type declarations for dagre and process
│   └── webview/
│       ├── index.ts          # Webview entry point, toolbar, UI setup
│       ├── sqlParser.ts      # SQL parsing, AST processing, stats & hints generation
│       ├── renderer.ts       # SVG rendering, graph layout, interaction handlers
│       └── sqlFormatter.ts   # SQL formatting, syntax highlighting, diff utility
├── dist/                     # Compiled JavaScript output (webpack bundle)
├── out/                      # TypeScript compilation output (if using tsc directly)
├── package.json              # Extension manifest and dependencies
├── tsconfig.json             # TypeScript configuration
├── webpack.config.js         # Webpack bundling configuration (extension + webview)
└── jest.config.js            # Jest test configuration
```

### Source Files Overview

- **extension.ts**: Main extension entry point, registers commands, handles activation
- **visualizationPanel.ts**: Manages webview panel lifecycle, VS Code messaging, HTML generation
- **webview/index.ts**: Webview application entry, creates toolbar UI, handles user interactions
- **webview/sqlParser.ts**: SQL parsing using node-sql-parser, generates flow graph (nodes/edges), calculates statistics
- **webview/renderer.ts**: SVG rendering engine, graph layout with dagre, pan/zoom, search, export functionality
- **webview/sqlFormatter.ts**: SQL code formatting, syntax highlighting, query diff algorithm
- **types.d.ts**: TypeScript type definitions for external libraries (dagre, process)

### Tech Stack

- **VS Code Extension API** - Extension framework
- **TypeScript** - Type-safe development
- **node-sql-parser** - SQL parsing (multi-dialect)
- **dagre** - Graph layout algorithm
- **Pure SVG** - Lightweight rendering
- **Webpack** - Bundling

### Bundle Size

| File | Size | Description |
|------|------|-------------|
| extension.js | ~3-5 KB | Extension host code (VS Code API integration) |
| webview.js | ~2.5 MB | Webview bundle (includes dagre, node-sql-parser, rendering logic) |

The webview bundle is larger due to:
- `node-sql-parser` (~1.5 MB) - Multi-dialect SQL parsing library
- `dagre` (~200 KB) - Graph layout algorithm
- Rendering and UI code (~800 KB)

## Configuration

The extension supports the following VS Code settings:

- **sqlCrack.defaultDialect** (default: `"MySQL"`): Default SQL dialect for parsing queries
  - Options: MySQL, PostgreSQL, TransactSQL, Snowflake, BigQuery, Redshift, Hive, Athena, Trino, MariaDB, SQLite
- **sqlCrack.syncEditorToFlow** (default: `true`): Enable/disable highlighting flow nodes when clicking in SQL editor

## Privacy

- **100% Local** - All processing happens in VS Code
- **No Network Calls** - Your SQL never leaves your machine
- **No Telemetry** - No usage data collected
- **Open Source** - All code is auditable

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License

## Acknowledgments

- Inspired by [JSON Crack](https://jsoncrack.com/) and Snowflake Query Profile
- SQL parsing by [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser)
- Graph layout by [dagre](https://github.com/dagrejs/dagre)

---

**Made for the SQL community**
