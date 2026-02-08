# SQL Crack Examples

Interactive examples to explore SQL Crack features. Open any file and press `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux) to visualize.

---

## Quick Start

1. Open `demo-showcase.sql`
2. Press `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux) to visualize
3. Press `?` to see all keyboard shortcuts
4. Try pressing `C` for column lineage, `E` to expand CTEs, `H` to change layout

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
| **CASE expressions** | `basic-case-expressions.sql` | Check node details panel for branch logic |
| **Set operations** | `basic-set-operations.sql` | See UNION/INTERSECT/EXCEPT connecting nodes |
| **Table-valued functions** | `tvf-bigquery.sql`, `tvf-snowflake.sql`, `tvf-transactsql.sql` | Verify UNNEST/FLATTEN/OPENJSON appear as table-function nodes |
| **Performance hints** | `quality-performance-hints.sql` | Check hints panel (bottom-left) for anti-patterns |
| **Quality warnings** | `quality-code-warnings.sql` | Look for ⚠ warning badges on nodes |
| **Write operations** | `dml-write-operations.sql` | See INSERT/UPDATE/DELETE/MERGE badges |
| **Complex queries** | `complex-analytics-queries.sql` | Press `E` to expand all CTEs at once |
| **Data pipelines** | `lineage-data-pipeline.sql` | Trace multi-stage ETL transformations |

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
| `T` | Toggle dark/light theme |
| `F` | Fullscreen mode |
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

4. **Compare layouts**: Press `H` to cycle through layouts:
   - **Vertical** — Best for simple queries (top-to-bottom flow)
   - **Horizontal** — Best for wide joins (left-to-right flow)
   - **Compact** — Reduces whitespace for dense graphs
   - **Force** — Physics-based layout for complex relationships
   - **Radial** — Highlights center-out lineage for hub-and-spoke style queries

5. **Performance review**: Open `quality-performance-hints.sql` and check the hints panel. Each query demonstrates a different anti-pattern.

6. **Drag clouds**: After pressing `E` to expand all CTEs, you can drag the cloud panels to reposition them. Arrows follow automatically.

7. **Export for documentation**: Use the export dropdown (PNG, SVG, Mermaid, Copy Mermaid) to save diagrams for wikis, PRs, or presentations.

8. **Keyboard navigation**: Use `Tab` to focus nodes, `Arrow keys` to navigate, `Enter` to select. Great for accessibility or when mouse isn't available.

---

## Workspace Analysis

To explore cross-file dependencies:

1. Right-click the `examples` folder
2. Select **"SQL Crack: Analyze Workspace Dependencies"**
3. Use the four view tabs:
   - **Graph** — File and table dependency visualization
   - **Lineage** — Data flow with upstream/downstream tracking
   - **Tables** — Browse all tables/views with column details
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
