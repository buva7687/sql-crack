# SQL Crack Examples

Interactive examples to explore SQL Crack features. Open any file and press `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux) to visualize.

---

## Quick Start

1. Open `demo-showcase.sql`
2. Visualize with `Cmd/Ctrl+Shift+L`
3. Press `?` to see all keyboard shortcuts

---

## By Feature

| Want to learn... | Open this file | Try this |
|------------------|----------------|----------|
| **JOIN visualization** | `basic-joins.sql` | See edge colors for different join types |
| **CTE expansion** | `basic-ctes.sql` | Double-click a CTE node to expand |
| **Nested CTEs** | `basic-ctes.sql` Q7 | Click breadcrumbs to navigate levels |
| **Column lineage** | `lineage-column-tracking.sql` | Press `C`, then click any output column |
| **Window functions** | `basic-window-functions.sql` | Notice OVER clause in node details |
| **Aggregations** | `basic-aggregates.sql` | See GROUP BY nodes with aggregate badges |
| **Subqueries** | `basic-subqueries.sql` | Double-click subquery nodes |
| **CASE expressions** | `basic-case-expressions.sql` | Check node details for branch logic |
| **Set operations** | `basic-set-operations.sql` | UNION/INTERSECT/EXCEPT nodes |
| **Performance hints** | `quality-performance-hints.sql` | Check hints panel (bottom-left) |
| **Quality warnings** | `quality-code-warnings.sql` | Look for warning badges on nodes |
| **Write operations** | `dml-write-operations.sql` | See INSERT/UPDATE/DELETE badges |
| **Complex queries** | `complex-analytics-queries.sql` | Press `E` to expand all CTEs |
| **Data pipelines** | `lineage-data-pipeline.sql` | Trace multi-stage transformations |

---

## Keyboard Shortcuts Cheat Sheet

| Key | Action |
|-----|--------|
| `C` | Toggle column lineage |
| `E` | Expand/collapse all CTEs |
| `L` | Toggle legend |
| `S` | Toggle SQL preview |
| `Q` | Toggle query stats |
| `H` | Cycle layout (vertical/horizontal/compact/force) |
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

1. **Multi-query files**: Use `[` and `]` to navigate between queries (Q1, Q2, Q3...)

2. **Deep dive into CTEs**: Double-click a CTE node to expand it in a floating panel. You can pan/zoom independently inside the panel.

3. **Trace column origins**: Press `C` to enable column lineage, then click any output column to highlight its source path through joins and transformations.

4. **Compare layouts**: Press `H` to cycle through layouts. Vertical works best for simple queries, horizontal for wide joins, compact for dense graphs.

5. **Performance review**: Open `quality-performance-hints.sql` and check the hints panel. Each query demonstrates a different anti-pattern.

6. **Drag clouds**: After pressing `E` to expand all CTEs, you can drag the cloud panels to reposition them. Arrows follow automatically.

---

## Workspace Analysis

To explore cross-file dependencies:

1. Right-click the `examples` folder
2. Select **"SQL Crack: Analyze Workspace Dependencies"**
3. Use the four view tabs: Graph, Lineage, Tables, Impact

This shows how tables in `schema-*.sql` files are referenced by queries in other files.
