# SQL Crack 🚀

**Visualize SQL queries with interactive diagrams - JSON Crack style for SQL!**

SQL Crack is a Visual Studio Code extension that transforms your SQL queries into beautiful, interactive visualizations. Understand complex queries at a glance with node-based diagrams showing tables, joins, conditions, and data flow.

## Features ✨

### Core Visualization
- **Interactive Node Graphs**: See your SQL queries as beautiful, interactive diagrams
- **JSON Crack Style**: Inspired by the popular JSON Crack tool
- **Query Analysis**: Break down SELECT, INSERT, UPDATE, DELETE statements
- **Join Visualization**: Clearly see table relationships and JOIN operations
- **Real-time Updates**: Visualize selected SQL code or entire files
- **Pan & Zoom**: Navigate large queries with built-in controls

### Advanced Features 🎯
- **Schema Visualization (ER Diagrams)**: Parse CREATE TABLE statements and visualize database schemas with foreign key relationships
- **CTE Support**: Common Table Expressions (WITH clauses) displayed with distinct styling
- **Window Functions**: PARTITION BY and ORDER BY details visualized
- **Subquery Detection**: Subqueries highlighted with special borders
- **Set Operations**: UNION, INTERSECT, EXCEPT operations shown with connections
- **Multi-Dialect Support**: MySQL, PostgreSQL, SQL Server (T-SQL), MariaDB, SQLite
- **Export Capabilities**: Export visualizations to PNG or SVG (1920x1080)
- **Query Statistics**: Real-time complexity analysis with scoring
- **Theme Customization**: 5 built-in color themes (Dark, Light, Ocean, Forest, Sunset)
- **Interactive Node Selection**: Click nodes to view detailed information
- **Query Optimization Hints**: Automatic detection of anti-patterns and performance issues
- **Local Storage**: Save, load, and manage your favorite queries with automatic history tracking
- **Batch Processing**: Visualize multiple queries at once with easy navigation between them

### Privacy-Focused 🔒
- **100% Local Processing**: All parsing and visualization happens locally in VS Code
- **No Server Uploads**: Your SQL code never leaves your machine
- **No External Dependencies**: Everything runs client-side in the webview

## Demo

![SQL Crack Demo](https://via.placeholder.com/800x400.png?text=SQL+Crack+Visualization+Demo)

## Installation

### From VSIX
1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click the `...` menu → "Install from VSIX..."
5. Select the downloaded file

### From Source
```bash
# Clone the repository
git clone <repository-url>
cd sql-crack

# Install dependencies
npm install

# Build the extension
npm run compile

# Package (optional)
npm install -g vsce
vsce package
```

## Usage 🎯

### Basic Usage

1. Open any SQL file in VS Code
2. Click the **graph icon** in the editor title bar, or
3. Right-click in the editor and select **"SQL Crack: Visualize SQL Query"**, or
4. Use the Command Palette (Ctrl+Shift+P) and search for **"SQL Crack: Visualize SQL Query"**

### Visualizing Queries

- **Entire File**: Simply run the command with your cursor in the file
- **Selected Query**: Select specific SQL code and run the command to visualize just that portion

### Supported SQL Statements

- ✅ **SELECT** - Columns, tables, joins, where, group by, order by, limit, CTEs, window functions
- ✅ **INSERT** - Table and data insertion
- ✅ **UPDATE** - Table updates with conditions
- ✅ **DELETE** - Table deletions with conditions
- ✅ **CREATE TABLE** - Schema visualization with foreign keys
- ✅ **JOINs** - INNER, LEFT, RIGHT, FULL OUTER joins
- ✅ **CTEs** - WITH clause (Common Table Expressions)
- ✅ **Window Functions** - OVER, PARTITION BY, ROW_NUMBER, RANK, etc.
- ✅ **Set Operations** - UNION, INTERSECT, EXCEPT

### Query Optimization Hints ⚡

SQL Crack automatically analyzes your queries and provides optimization suggestions:

- **Performance Issues**: Detects SELECT *, missing LIMIT, missing WHERE on UPDATE/DELETE
- **Best Practices**: Identifies NOT IN usage, OR in WHERE clauses, functions on indexed columns
- **Security**: Flags potential security concerns
- **Maintainability**: Suggests improvements for code quality

Hints are displayed in a dismissible panel with severity levels (Error, Warning, Info) and categorized by type.

### Local Storage Features 💾

Save and manage your favorite queries:

- **Save Queries**: Save current query with a custom name
- **Load Queries**: Browse and load saved queries
- **Automatic History**: Last 20 queries automatically tracked
- **Search**: Find queries by name, SQL content, or tags
- **Export/Import**: Export queries as JSON for backup or sharing
- **Storage Stats**: Monitor storage usage

All data stored locally in browser localStorage for complete privacy.

### Batch Processing 📊

Work with multiple queries simultaneously:

- **Automatic Detection**: Queries separated by semicolons are automatically detected
- **Tab Navigation**: Switch between queries using tabs or arrow buttons
- **Individual Stats**: Each query gets its own complexity analysis and hints
- **Error Handling**: Failed queries are highlighted but don't block others
- **Preview**: See SQL preview for each query in the batch navigator

### Example Files

Check out the included example files:
- `example.sql` - Basic SELECT, INSERT, UPDATE, DELETE queries
- `example-schema.sql` - E-commerce database schema with foreign keys
- `example-advanced.sql` - CTEs, window functions, subqueries, and UNION operations
- `example-batch.sql` - Multiple queries demonstrating batch processing

### Example Queries

**Simple SELECT:**
```sql
SELECT id, name, email
FROM users
WHERE active = 1
ORDER BY created_at DESC
LIMIT 10;
```

**Complex JOIN:**
```sql
SELECT
    u.name,
    o.order_id,
    p.product_name,
    od.quantity
FROM users u
INNER JOIN orders o ON u.id = o.user_id
LEFT JOIN order_details od ON o.order_id = od.order_id
INNER JOIN products p ON od.product_id = p.id
WHERE o.status = 'completed'
    AND o.created_at >= '2024-01-01'
GROUP BY u.name, o.order_id
ORDER BY o.created_at DESC;
```

**CTE with Window Function:**
```sql
WITH ranked_employees AS (
    SELECT
        employee_id,
        department_id,
        salary,
        ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) as salary_rank
    FROM employees
)
SELECT * FROM ranked_employees WHERE salary_rank <= 3;
```

**Schema Definition:**
```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL
);

CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    total_amount DECIMAL(10, 2),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Visualization Components 🎨

The extension creates different colored nodes for different SQL components:

- **Purple** - Query root (SELECT, INSERT, UPDATE, DELETE)
- **Green** - SELECT columns
- **Blue** - FROM tables
- **Orange** - JOINs
- **Purple** - WHERE conditions
- **Pink** - GROUP BY clauses
- **Teal** - ORDER BY clauses
- **Orange** - LIMIT clauses
- **Dashed Purple** - CTEs (WITH clauses)
- **Pink** - Window Functions
- **Dashed Teal** - Subqueries
- **Orange** - Set Operations (UNION, INTERSECT, EXCEPT)
- **Gradient Purple** - Schema Tables (with 🔑 for primary keys, 🔗 for foreign keys)

## UI Features

### Panels
- **Top-Left**: Main control panel with SQL dialect selector and theme chooser
- **Top-Center**: Optimization hints panel (when hints are available) or Batch navigator (when multiple queries detected)
- **Top-Right**: Export buttons (PNG, SVG), Fit View, Save, and Saved Queries buttons
- **Bottom-Left**: Node details panel (appears when clicking a node)
- **Bottom-Center**: Saved queries panel (appears when clicking "Saved" button)
- **Bottom-Right**: Query statistics panel with complexity analysis

### Export Options
- **PNG Export**: High-resolution (1920x1080) PNG images
- **SVG Export**: Vector graphics for scalable diagrams
- **Local Processing**: All exports happen client-side

### Query Statistics
- **Complexity Levels**: Simple, Moderate, Complex, Very Complex
- **Metrics Tracked**: Tables, Joins, CTEs, Window Functions, Subqueries, Set Operations
- **Color-Coded Scoring**: Visual feedback on query complexity

### Theme Customization
- **Dark** - Default dark theme with purple accents
- **Light** - Clean light theme for presentations
- **Ocean** - Blue-teal cyberpunk theme
- **Forest** - Green nature-inspired theme
- **Sunset** - Pink-purple gradient theme

## Controls

- **Pan**: Click and drag on the canvas
- **Zoom**: Scroll wheel or use the +/- controls
- **Fit View**: Click "Fit View" button to reset camera
- **Node Selection**: Click any node to view details
- **Minimap**: Navigate large diagrams using the minimap
- **Export**: Use PNG/SVG buttons to save visualizations

## Development 🛠️

### Project Structure

```
sql-crack/
├── src/
│   ├── extension.ts             # Extension activation & commands
│   ├── visualizationPanel.ts    # WebView panel management
│   └── webview/
│       ├── index.tsx            # React entry point
│       ├── App.tsx              # Main React component
│       ├── sqlParser.ts         # SQL query parsing & graph generation
│       ├── schemaParser.ts      # CREATE TABLE parsing & ER diagrams
│       ├── queryStats.ts        # Query complexity analysis
│       ├── themes.ts            # Color theme definitions
│       ├── optimizationHints.ts # Query optimization analysis
│       ├── queryStorage.ts      # Local storage for saved queries
│       └── batchProcessor.ts    # Batch query processing
├── dist/                        # Compiled output
├── example.sql                 # Basic example queries
├── example-schema.sql          # Database schema examples
├── example-advanced.sql        # Advanced feature examples
├── example-batch.sql           # Batch processing examples
├── package.json
├── tsconfig.json
└── webpack.config.js
```

### Tech Stack

- **VS Code Extension API** - Extension framework
- **TypeScript** - Type-safe development
- **React** - UI framework
- **ReactFlow** - Graph visualization library
- **node-sql-parser** - SQL parsing (supports multiple dialects)
- **html-to-image** - Client-side image export
- **Webpack** - Bundling

### Development Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile on save)
npm run watch

# Package extension
npm run package
```

### Testing Locally

1. Open the project in VS Code
2. Press **F5** to launch Extension Development Host
3. Open a SQL file in the new window (try example.sql or example-schema.sql)
4. Test the visualization command

## Configuration

SQL Crack works out of the box with no configuration needed. All settings are accessible through the UI:

- **SQL Dialect**: Choose from MySQL, PostgreSQL, SQL Server (T-SQL), MariaDB, SQLite
- **Theme**: Select from 5 built-in color themes
- **Statistics Panel**: Toggle visibility with the close button
- **Export Settings**: Default resolution 1920x1080

## Known Limitations ⚠️

- **Very Large Schemas**: Schemas with 100+ tables may require manual zoom adjustment
- **Deeply Nested Queries**: Queries with 5+ levels of subquery nesting may need manual layout
- **Complex Window Functions**: Some advanced window function syntax may not parse perfectly

## Roadmap 🗺️

- [x] Support for PostgreSQL, SQL Server, Oracle, SQLite dialects
- [x] CTE (Common Table Expression) visualization
- [x] Subquery detection and visualization
- [x] Export diagrams as PNG/SVG
- [x] Custom color themes
- [x] Database schema visualization
- [x] Query complexity analysis
- [ ] Collapsible subquery/CTE nodes
- [ ] Query optimization suggestions
- [ ] Custom node layouts (tree, hierarchical, circular)
- [ ] Dark/Light mode sync with VS Code theme
- [ ] Save/load layout preferences

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Privacy & Security

SQL Crack is designed with privacy as a core principle:
- **No telemetry** - We don't collect any usage data
- **No network calls** - Everything runs locally
- **No data storage** - Your SQL code is never saved or transmitted
- **Open source** - All code is visible and auditable

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Inspired by [JSON Crack](https://jsoncrack.com/)
- Built with [ReactFlow](https://reactflow.dev/)
- SQL parsing by [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser)
- Image export by [html-to-image](https://github.com/bubkoo/html-to-image)

## Support

If you encounter any issues or have suggestions, please [open an issue](https://github.com/yourusername/sql-crack/issues).

---

**Made with ❤️ for the SQL community**
