# SQL Crack 🚀

**Visualize SQL queries with interactive diagrams - JSON Crack style for SQL!**

SQL Crack is a Visual Studio Code extension that transforms your SQL queries into beautiful, interactive visualizations. Understand complex queries at a glance with node-based diagrams showing tables, joins, conditions, and data flow.

## Features ✨

- **Interactive Visualizations**: See your SQL queries as interactive node graphs
- **JSON Crack Style**: Inspired by the popular JSON Crack tool, with similar intuitive visualization
- **Query Analysis**: Break down SELECT, INSERT, UPDATE, DELETE statements into visual components
- **Join Visualization**: Clearly see table relationships and JOIN operations
- **Real-time Updates**: Visualize selected SQL code or entire files
- **Pan & Zoom**: Navigate large queries with ease using built-in controls

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

- ✅ **SELECT** - Columns, tables, joins, where, group by, order by, limit
- ✅ **INSERT** - Table and data insertion
- ✅ **UPDATE** - Table updates with conditions
- ✅ **DELETE** - Table deletions with conditions
- ✅ **JOINs** - INNER, LEFT, RIGHT, FULL OUTER joins

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

## Controls

- **Pan**: Click and drag on the canvas
- **Zoom**: Scroll wheel or use the +/- controls
- **Fit View**: Reset to see all nodes
- **Minimap**: Navigate large diagrams using the minimap in the bottom-right

## Development 🛠️

### Project Structure

```
sql-crack/
├── src/
│   ├── extension.ts           # Extension activation & commands
│   ├── visualizationPanel.ts  # WebView panel management
│   └── webview/
│       ├── index.tsx          # React entry point
│       ├── App.tsx            # Main React component
│       └── sqlParser.ts       # SQL parsing & graph generation
├── dist/                      # Compiled output
├── package.json
├── tsconfig.json
└── webpack.config.js
```

### Tech Stack

- **VS Code Extension API** - Extension framework
- **TypeScript** - Type-safe development
- **React** - UI framework
- **ReactFlow** - Graph visualization library
- **node-sql-parser** - SQL parsing
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
3. Open a SQL file in the new window
4. Test the visualization command

## Configuration

Currently, SQL Crack works out of the box with no configuration needed. Future versions may include customization options for:

- Color themes
- Node styles
- Layout algorithms
- Supported SQL dialects

## Known Limitations ⚠️

- **SQL Dialects**: Primarily supports MySQL syntax (PostgreSQL, SQL Server support coming soon)
- **Complex Subqueries**: Very deeply nested subqueries may not render optimally
- **Large Queries**: Queries with 50+ tables may require manual layout adjustment

## Roadmap 🗺️

- [ ] Support for PostgreSQL, SQL Server, Oracle dialects
- [ ] CTE (Common Table Expression) visualization
- [ ] Subquery expansion/collapse
- [ ] Export diagrams as PNG/SVG
- [ ] Custom color themes
- [ ] Query optimization suggestions
- [ ] Database schema import and visualization

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Inspired by [JSON Crack](https://jsoncrack.com/)
- Built with [ReactFlow](https://reactflow.dev/)
- SQL parsing by [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser)

## Support

If you encounter any issues or have suggestions, please [open an issue](https://github.com/yourusername/sql-crack/issues).

---

**Made with ❤️ for the SQL community**
