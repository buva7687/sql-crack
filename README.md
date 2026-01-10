# SQL Crack

**Visualize SQL queries with interactive flow diagrams**

SQL Crack is a lightweight Visual Studio Code extension that transforms SQL queries into clear, interactive execution flow visualizations. Inspired by Snowflake Query Profile and JSON Crack, it helps you understand complex queries at a glance.

## Features

- **Execution Flow Visualization** - See how your SQL query executes step by step
- **Interactive Nodes** - Click any node to view detailed information
- **Pan & Zoom** - Navigate large queries with mouse drag and scroll
- **Multi-Dialect Support** - MySQL, PostgreSQL, SQL Server, MariaDB, SQLite
- **PNG Export** - Download visualizations as high-resolution images
- **Lightweight** - Pure SVG rendering, no heavy dependencies

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
| Window functions | Partial |

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
# Install dependencies
npm install

# Compile (development)
npm run compile

# Watch mode
npm run watch

# Production build
npm run package

# Type check
npm run typecheck

# Lint
npm run lint
```

Press **F5** in VS Code to launch the Extension Development Host for testing.

## Usage

1. Open any `.sql` file in VS Code
2. Use one of these methods to visualize:
   - Click the **graph icon** in the editor title bar
   - Right-click and select **"SQL Crack: Visualize SQL Query"**
   - Press **`Cmd+Shift+V`** (Mac) or **`Ctrl+Shift+V`** (Windows/Linux)
   - Use Command Palette: **"SQL Crack: Visualize SQL Query"**

### Tips

- **Select specific SQL** to visualize just that portion
- **Change dialect** using the dropdown in the visualization panel
- **Click nodes** to see operation details in the side panel
- **Export to PNG** using the button in the top-right corner

## Example

```sql
SELECT
    u.id,
    u.name,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 100;
```

This query generates a flow diagram showing:
- **users** (source table)
- **LEFT JOIN** with orders
- **WHERE** filter on status
- **GROUP BY** aggregation
- **HAVING** filter on groups
- **SELECT** column projection
- **ORDER BY** sorting
- **LIMIT** row limiting
- **Result** output

## Node Types & Colors

| Node Type | Color | Description |
|-----------|-------|-------------|
| Table | Blue | Source tables |
| Filter | Purple | WHERE/HAVING conditions |
| Join | Pink | JOIN operations |
| Aggregate | Amber | GROUP BY operations |
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
│       ├── sqlParser.ts      # SQL parsing & layout
│       └── renderer.ts       # SVG rendering engine
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
- **Pure SVG** - Lightweight rendering (no React/ReactFlow)
- **Webpack** - Bundling

### Bundle Size

| File | Size |
|------|------|
| extension.js | 3.4 KB |
| webview.js | 2.6 MB |

The webview bundle is primarily `node-sql-parser` (2.38 MB) which provides comprehensive SQL parsing across multiple dialects.

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
