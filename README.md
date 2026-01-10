# SQL Crack

**Visualize SQL queries with interactive flow diagrams**

SQL Crack is a lightweight Visual Studio Code extension that transforms SQL queries into clear, interactive execution flow visualizations. Inspired by Snowflake Query Profile and JSON Crack, it helps you understand complex queries at a glance.

## Features

- **Execution Flow Visualization** - See how your SQL query executes step by step
- **Multiple Query Support** - Visualize multiple SQL statements with tab navigation
- **Interactive Nodes** - Click nodes to view details, double-click to zoom
- **Node Search** - Search nodes by name (Ctrl+F / Cmd+F)
- **Query Statistics** - Complexity score, table/join/filter counts
- **Optimization Hints** - Automatic detection of common SQL anti-patterns
- **Pan & Zoom** - Navigate with mouse drag and scroll wheel
- **Multi-Dialect Support** - MySQL, PostgreSQL, SQL Server, MariaDB, SQLite
- **Export Options** - PNG, SVG, or copy to clipboard

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
- **Search nodes** - Ctrl+F to search, Enter for next result
- **Edge highlighting** - Hover/click nodes to highlight connected edges
- **Zoom to node** - Double-click any node to zoom in
- **Keyboard shortcuts** - Escape to clear selection

### Export Enhancements
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
npm run compile    # Development build
npm run watch      # Watch mode
npm run package    # Production build
npm run typecheck  # Type check
npm run lint       # Lint
```

Press **F5** in VS Code to launch the Extension Development Host.

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
| `Cmd/Ctrl + F` | Focus search box |
| `Enter` | Next search result |
| `Escape` | Clear selection / search |
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
│   ├── extension.ts          # VS Code extension entry
│   ├── visualizationPanel.ts # Webview panel management
│   ├── types.d.ts            # Type declarations
│   └── webview/
│       ├── index.ts          # Webview entry point
│       ├── sqlParser.ts      # SQL parsing, stats & hints
│       └── renderer.ts       # SVG rendering & UI
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── webpack.config.js
```

### Tech Stack

- **VS Code Extension API** - Extension framework
- **TypeScript** - Type-safe development
- **node-sql-parser** - SQL parsing (multi-dialect)
- **dagre** - Graph layout algorithm
- **Pure SVG** - Lightweight rendering
- **Webpack** - Bundling

### Bundle Size

| File | Size |
|------|------|
| extension.js | 3.4 KB |
| webview.js | 2.5 MB |

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
