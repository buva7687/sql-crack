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

SQL Crack is a VS Code extension that visualizes SQL queries as interactive execution flow diagrams. Understand complex queries at a glance, track column lineage, and identify optimization opportunities.

> Inspired by [JSON Crack](https://jsoncrack.com/) and Snowflake Query Profile

<!-- Add screenshot/GIF here -->
<!-- ![SQL Crack Demo](./assets/demo.gif) -->

## Features

### Visual Query Analysis

- **Execution Flow Visualization** — See how your SQL query executes step by step
- **Multi-Query Support** — Visualize multiple SQL statements with tab navigation (Q1, Q2, Q3...)
- **Column Lineage Tracking** — Trace column sources through the query pipeline
- **Query Statistics** — Complexity score, table/join/filter counts, and more

### Interactive Experience

- **Click & Explore** — Click nodes to view details, double-click to zoom
- **Search Nodes** — Find nodes by name with `Ctrl+F` / `Cmd+F`
- **Focus Mode** — Highlight connected nodes for better understanding
- **Editor Sync** — Click in SQL editor to highlight corresponding flow nodes

### Flexible Display Options

- **View Location Toggle** — Choose where to display: beside editor, new tab, or secondary sidebar
- **Pin Visualizations** — Save query snapshots as separate tabs for comparison
- **Persistent Pins** — Pinned tabs survive VS Code restarts
- **Theme Support** — Dark and light themes with grid pattern background

### Export & Share

- **PNG Export** — High-DPI images with background
- **SVG Export** — Vector format for scalable diagrams
- **Clipboard Copy** — Quick sharing via clipboard

### Smart Analysis

Automatic detection of SQL anti-patterns:

| Issue | Severity |
|-------|----------|
| `SELECT *` usage | Warning |
| Missing `LIMIT` clause | Info |
| `DELETE`/`UPDATE` without `WHERE` | Error |
| Excessive JOINs (5+) | Warning |
| Cartesian products | Error |

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

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + V` | Open visualization |
| `Cmd/Ctrl + F` | Search nodes |
| `Enter` / `↓` | Next search result |
| `↑` | Previous search result |
| `Escape` | Clear selection |
| `L` | Toggle legend |
| `S` | Toggle SQL preview |
| `T` | Toggle theme |
| `F` | Toggle fullscreen |
| `?` | Show all shortcuts |

### Node Types

| Node | Color | Description |
|------|-------|-------------|
| Table | Blue | Source tables |
| Filter | Purple | WHERE/HAVING conditions |
| Join | Pink | JOIN operations |
| Aggregate | Amber | SUM, COUNT, AVG, etc. |
| Window | Fuchsia | Window functions |
| Select | Indigo | Column projection |
| Sort | Green | ORDER BY |
| Limit | Cyan | LIMIT clause |
| CTE | Purple | Common Table Expressions |
| Result | Green | Query output |

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
│       └── sqlFormatter.ts    # SQL formatting
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
