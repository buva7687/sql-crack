# SQL Crack Examples

Interactive examples to explore SQL Crack features. Open any file and press `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux) to visualize.

---

## Quick Start

1. Open `demo-showcase.sql`
2. Press `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux) to visualize
3. Press `?` to see all keyboard shortcuts
4. Try pressing `C` for column lineage, `E` to expand CTEs, `H` to change layout, `L` to toggle the legend, and `Cmd/Ctrl+Z` to undo layout actions

---

## Learn by Feature

| Want to learn... | Open this file | Try this |
|------------------|----------------|----------|
| **JOIN visualization** | `basic-joins.sql` | See different edge colors for INNER, LEFT, RIGHT joins |
| **CTE expansion** | `basic-ctes.sql` | Double-click any CTE node to expand in floating panel |
| **Nested CTEs** | `basic-ctes.sql` (Q7) | Click breadcrumbs to navigate between nesting levels |
| **Column lineage** | `lineage-column-tracking.sql` | Press `C`, then click any output column to trace its path |
| **Window functions** | `basic-window-functions.sql` | Notice OVER clause details, PARTITION BY/ORDER BY badges |
| **Aggregations** | `basic-aggregates.sql` | See GROUP BY nodes with COUNT/SUM/AVG badges |
| **Subqueries** | `basic-subqueries.sql` | Double-click subquery nodes to expand |
| **Expression subqueries (SQ badge)** | `advanced_subqueries.sql` | SQ-badged tables route to the clause they belong to (WHERE, HAVING, SELECT, JOIN ON) |
| **CASE expressions** | `basic-case-expressions.sql` | Check node details panel for branch logic |
| **Set operations** | `basic-set-operations.sql` | See UNION/INTERSECT/EXCEPT connecting nodes |
| **Table-valued functions** | `tvf-bigquery.sql`, `tvf-snowflake.sql`, `tvf-transactsql.sql` | Verify UNNEST/FLATTEN/OPENJSON appear as table-function nodes |
| **Query compare mode** | `compare-mode-before.sql` + `compare-mode-after.sql` | Pin the first, open second, click **Compare with Baseline Query** to inspect added/removed/changed nodes |
| **Query compare mode (KPI refactor)** | `compare-mode-kpi-before.sql` + `compare-mode-kpi-after.sql` | Compare correlated-subquery baseline vs CTE/join rewrite and inspect structural deltas |
| **Inline diagnostics + quick fix** | `diagnostics-playground.sql` | Save file, open Problems, use **Show in SQL Flow** quick fix |
| **Parser resilience / mixed batch behavior** | `parser-resilience-playground.sql` | Check mixed valid/invalid/procedural statements and fallback behavior |
| **Performance hints** | `quality-performance-hints.sql` | Check hints panel (bottom-left) for anti-patterns |
| **Quality warnings** | `quality-code-warnings.sql` | Look for ⚠ warning badges on nodes |
| **Write operations** | `dml-write-operations.sql` | See INSERT/UPDATE/DELETE/MERGE badges |
| **Complex queries** | `complex-analytics-queries.sql` | Press `E` to expand all CTEs at once |
| **Data pipelines** | `lineage-data-pipeline.sql` | Trace multi-stage ETL transformations |

---

## Compare with Baseline Query

Use compare mode to diff the current query graph against a baseline query graph.

### How baseline is selected

1. **Newest pinned query** (excluding the exact current SQL text)
2. Otherwise, **another query in the same multi-query file** (fallback)
3. If neither exists, compare mode shows a baseline warning

### Recommended workflow

1. Open `compare-mode-before.sql` (or Q1 in `demo-showcase.sql`) and visualize
2. Click **Pin visualization as new tab**
3. Open the revised query (`compare-mode-after.sql` or modified Q1)
4. Click **Compare with Baseline Query**
5. Read the diff:
   - **Added** (green)
   - **Removed** (red, dashed)
   - **Changed** (amber)

### Compare tips

- Each pane supports **independent pan/zoom**.
- Compare mode shows a **stats delta** (joins, subqueries, complexity score).
- Pinning multiple snapshots works; compare uses the **most recent pinned** snapshot as baseline.

---

## Keyboard Shortcuts Cheat Sheet

| Key | Action |
|-----|--------|
| `C` | Toggle column lineage |
| `E` | Expand/collapse all CTEs |
| `L` | Toggle legend |
| `S` | Toggle SQL preview |
| `Q` | Toggle query stats |
| `H` | Cycle layout (vertical/horizontal/compact/force/radial) |
| `1-5` | Jump directly to a layout option from the picker |
| `T` | Toggle dark/light theme |
| `F` | Fullscreen mode |
| `Cmd/Ctrl+Z` | Undo latest layout change |
| `Cmd/Ctrl+Shift+Z` | Redo layout change |
| `[` / `]` | Previous/next query |
| `Cmd/Ctrl+F` | Search nodes |
| `?` | Show all shortcuts |

---

## File Reference

### Basic Operations
| File | What it demonstrates |
|------|---------------------|
| `basic-joins.sql` | INNER, LEFT, RIGHT, FULL, CROSS, self-joins, star schema |
| `basic-ctes.sql` | Simple, chained, recursive CTEs with window functions |
| `basic-subqueries.sql` | Scalar, correlated, EXISTS, IN subqueries |
| `advanced_subqueries.sql` | WHERE IN and FROM derived subqueries with SQ-badged clause routing |
| `basic-aggregates.sql` | GROUP BY, HAVING, COUNT, SUM, AVG patterns |
| `basic-window-functions.sql` | ROW_NUMBER, RANK, LAG, LEAD, running totals |
| `basic-case-expressions.sql` | Simple CASE, searched CASE, nested conditions |
| `basic-set-operations.sql` | UNION, UNION ALL, INTERSECT, EXCEPT |

### Table-Valued Functions
| File | What it demonstrates |
|------|---------------------|
| `tvf-bigquery.sql` | BigQuery UNNEST() as source and join input |
| `tvf-snowflake.sql` | Snowflake LATERAL FLATTEN and TABLE(FLATTEN(...)) |
| `tvf-transactsql.sql` | SQL Server OPENJSON() source and CROSS APPLY usage |

### Roadmap Workflows
| File | What it demonstrates |
|------|---------------------|
| `compare-mode-before.sql` | Baseline query snapshot for compare mode |
| `compare-mode-after.sql` | Optimized query revision for compare mode diffing |
| `compare-mode-kpi-before.sql` | KPI query baseline with repeated scalar subqueries |
| `compare-mode-kpi-after.sql` | KPI query refactor using reusable CTEs and joins |
| `diagnostics-playground.sql` | Hint + parse diagnostics surfaced in Problems with quick fix |
| `parser-resilience-playground.sql` | Comment/procedural splitting edges and mixed batch success/failure |

### Column Lineage
| File | What it demonstrates |
|------|---------------------|
| `lineage-column-tracking.sql` | Passthrough, renamed, aggregated, calculated columns |
| `lineage-data-pipeline.sql` | Multi-stage ETL with transformation tracking |

### Quality Analysis
| File | What it demonstrates |
|------|---------------------|
| `quality-code-warnings.sql` | Unused CTEs, dead columns, duplicate subqueries |
| `quality-performance-hints.sql` | Filter pushdown, non-sargable, leading wildcard |

### Write Operations
| File | What it demonstrates |
|------|---------------------|
| `dml-write-operations.sql` | INSERT, UPDATE, DELETE, MERGE, CTAS |

### Analytics Examples
| File | What it demonstrates |
|------|---------------------|
| `analytics-customer.sql` | Customer LTV, retention cohorts, RFM segmentation, NPS scores |
| `analytics-orders.sql` | Daily trends, product ranking, fulfillment analysis, cross-selling |

### Complex Examples
| File | What it demonstrates |
|------|---------------------|
| `complex-analytics-queries.sql` | 5 enterprise queries with 4+ CTEs each |
| `enterprise-complex-queries.sql` | Real-world reporting patterns |
| `demo-showcase.sql` | Curated examples for quick demos |

### Schema Files
| File | What it demonstrates |
|------|---------------------|
| `schema-ecommerce.sql` | E-commerce DDL (customers, orders, products) |
| `schema-enterprise-ddl.sql` | Enterprise DDL (employees, projects, budgets) |
| `enterprise-schema-ddl.sql` | Extended enterprise schema |

---

## Pro Tips

1. **Multi-query files**: Use `[` and `]` to navigate between queries (Q1, Q2, Q3...). The tab bar shows error indicators for failed parses.

2. **Deep dive into CTEs**: Double-click a CTE node to expand it in a floating panel. You can pan/zoom independently inside the panel.

3. **Trace column origins**: Press `C` to enable column lineage, then click any output column to highlight its complete path through joins and transformations.

4. **Compare layouts**: Use the toolbar layout picker or press `H` to cycle:
   - **Vertical** — Best for simple queries (top-to-bottom flow)
   - **Horizontal** — Best for wide joins (left-to-right flow)
   - **Compact** — Reduces whitespace for dense graphs
   - **Force** — Physics-based layout for complex relationships
   - **Radial** — Highlights center-out lineage for hub-and-spoke style queries

5. **Performance review**: Open `quality-performance-hints.sql` and check the hints panel. Each query demonstrates a different anti-pattern.

6. **Drag clouds**: After pressing `E` to expand all CTEs, you can drag the cloud panels to reposition them. Arrows follow automatically.

7. **Export for documentation**: Use the export dropdown (PNG, SVG, Mermaid, Copy Mermaid) to save diagrams for wikis, PRs, or presentations.

8. **Keyboard navigation**: Use `Tab` to focus nodes, `Arrow keys` to navigate, `Enter` to select. Great for accessibility or when mouse isn't available.

9. **Compare query revisions**: Pin a query snapshot, switch to a modified query, then use the **Compare with Baseline Query** toolbar button to see side-by-side added/removed/changed node differences.

10. **Use diagnostics in editor**: Save a SQL file with anti-patterns (for example from `quality-performance-hints.sql`) and check Problems panel entries from **SQL Crack**. Use the quick fix **Show in SQL Flow** to jump straight into the graph.

11. **Validate compare mode quickly**: Visualize `compare-mode-before.sql`, pin it, then visualize `compare-mode-after.sql` and click **Compare with Baseline Query**. Confirm green/amber/red diff highlights and stats delta.
12. **Try a second compare scenario**: Repeat the same flow with `compare-mode-kpi-before.sql` and `compare-mode-kpi-after.sql` to compare correlated subqueries vs CTE/join refactor.
13. **Stress parser resilience**: Open `parser-resilience-playground.sql` and navigate batch tabs with `[` and `]` to verify mixed statements stay individually navigable.
14. **Legend behavior**: The legend is visible by default for first-time use and remembers your last toggle state. Press `L` anytime to show/hide it.

---

## Workspace Analysis

To explore cross-file dependencies:

1. Right-click the `examples` folder
2. Select **"SQL Crack: Analyze Workspace Dependencies"**
3. Use the three view tabs:
   - **Graph** — File and table dependency visualization
   - **Lineage** — Data flow with upstream/downstream tracking
   - **Impact** — Analyze what breaks if you change something

This shows how tables in `schema-*.sql` files are referenced by queries in other files.

---

## Troubleshooting Examples

| Issue | Solution |
|-------|----------|
| Query shows "Parse error" | Try changing dialect in the dropdown (top-left). PostgreSQL is most permissive. |
| Column lineage not working | Press `C` first, then click columns in the rightmost (SELECT) node. |
| CTE won't expand | Make sure to double-click (not single-click). Some CTEs may be leaf nodes with no children. |
| Graph looks cramped | Press `H` to try different layouts, or `F` for fullscreen. |
