# SQL Crack Demo Files

This directory contains comprehensive demo files showcasing all features of the SQL Crack extension.

## Files Overview

### Schema
| File | Description |
|------|-------------|
| `schema-ecommerce.sql` | Complete e-commerce database schema (customers, products, orders, inventory) |

### Basic SQL Features
| File | Description |
|------|-------------|
| `basic-joins.sql` | All JOIN types (INNER, LEFT, RIGHT, FULL, CROSS, self-joins) - 12 examples |
| `basic-aggregates.sql` | GROUP BY, HAVING, aggregate functions - 10 examples |
| `basic-ctes.sql` | Common Table Expressions including recursive CTEs - 9 examples |
| `basic-subqueries.sql` | Scalar, IN, EXISTS, correlated subqueries - 12 examples |
| `basic-window-functions.sql` | ROW_NUMBER, RANK, LAG, LEAD, running totals - 11 examples |
| `basic-case-expressions.sql` | Simple and nested CASE statements - 11 examples |
| `basic-set-operations.sql` | UNION, INTERSECT, EXCEPT operations - 10 examples |

### Column Lineage & Data Flow
| File | Description |
|------|-------------|
| `lineage-column-tracking.sql` | Column transformation types (passthrough, renamed, aggregated, calculated) - 10 examples |
| `lineage-data-pipeline.sql` | Multi-stage VIEW pipeline for workspace lineage and impact analysis |

### Write Operations
| File | Description |
|------|-------------|
| `dml-write-operations.sql` | INSERT, UPDATE, DELETE, MERGE operations - 17 examples |

### Quality & Performance
| File | Description |
|------|-------------|
| `quality-performance-hints.sql` | Performance anti-patterns (filter pushdown, non-sargable, etc.) - 20 examples |
| `quality-code-warnings.sql` | Code quality issues (unused CTEs, dead columns, etc.) - 14 examples |

### Analytics
| File | Description |
|------|-------------|
| `analytics-customer.sql` | Customer lifetime value, cohorts, RFM analysis - 4 queries |
| `analytics-orders.sql` | Order trends, fulfillment, cross-selling - 4 queries |

### Demo
| File | Description |
|------|-------------|
| `demo-showcase.sql` | **Comprehensive feature showcase** - 9 queries covering ALL features |

---

## Feature Coverage Matrix

| Feature | demo-showcase | basic-* | lineage-* | quality-* | analytics-* |
|---------|:-------------:|:-------:|:---------:|:---------:|:-----------:|
| **Visualization** |
| Click-to-jump navigation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edge condition display | ✅ | ✅ | ✅ | ✅ | ✅ |
| Breadcrumb navigation | ✅ | ✅ | ✅ | ✅ | ✅ |
| CTE cloud expansion | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SQL Features** |
| JOINs (all types) | ✅ | ✅ | ✅ | ✅ | ✅ |
| CTEs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window functions | ✅ | ✅ | ✅ | - | ✅ |
| Subqueries | ✅ | ✅ | ✅ | ✅ | ✅ |
| CASE statements | ✅ | ✅ | ✅ | ✅ | ✅ |
| UNION/Set operations | ✅ | ✅ | - | - | - |
| **Quality Analysis** |
| Unused CTE warnings | ✅ | - | - | ✅ | - |
| Dead column detection | ✅ | - | - | ✅ | - |
| Duplicate subqueries | - | - | - | ✅ | - |
| Repeated table scans | ✅ | - | - | ✅ | - |
| **Performance Hints** |
| Filter pushdown | ✅ | - | - | ✅ | - |
| Non-sargable expressions | ✅ | - | - | ✅ | - |
| Index suggestions | ✅ | - | - | ✅ | - |
| **Column Lineage** |
| Passthrough columns | ✅ | - | ✅ | - | - |
| Renamed columns | ✅ | - | ✅ | - | - |
| Aggregated columns | ✅ | - | ✅ | - | - |
| Calculated columns | ✅ | - | ✅ | - | - |
| **Write Operations** |
| INSERT | ✅ | - | - | - | - |
| UPDATE | ✅ | - | - | - | - |
| DELETE | ✅ | - | - | ✅ | - |
| MERGE | - | - | - | - | - |
| **Workspace Analysis** |
| Cross-file dependencies | ✅ | - | ✅ | - | ✅ |
| Impact analysis | - | - | ✅ | - | - |

---

## Quick Start Guide

### For Product Demos (5-10 minutes)
1. Open `demo-showcase.sql`
2. Click "Visualize SQL" button
3. Navigate through queries using Q1-Q9 tabs
4. Demonstrate key features:
   - Double-click CTEs to expand clouds
   - Click nodes to jump to SQL
   - Click edges to see JOIN conditions
   - Press 'Q' for query stats panel
   - Press 'C' for column lineage mode

### For Feature Testing
| Feature | File to Use |
|---------|-------------|
| CTE expansion | `basic-ctes.sql` or `demo-showcase.sql` Q1 |
| Performance hints | `quality-performance-hints.sql` |
| Code warnings | `quality-code-warnings.sql` |
| Column lineage | `lineage-column-tracking.sql` |
| Window functions | `basic-window-functions.sql` |
| Complex JOINs | `basic-joins.sql` |
| Workspace lineage | `lineage-data-pipeline.sql` + `schema-ecommerce.sql` |

### For Workspace Analysis Demo
1. Open the `examples/` folder in VS Code
2. Right-click → "Analyze Workspace Dependencies"
3. View file-to-file and table-to-table relationships
4. Click nodes to navigate to definitions
5. Use Lineage/Tables/Impact tabs

---

## Demo Script: Complete Walkthrough

### 1. Basic Visualization (2 min)
```
Open: demo-showcase.sql
Action: Visualize Query 1
Show: Node clicking, edge tooltips, zoom/pan
```

### 2. CTE Clouds (2 min)
```
Action: Double-click any CTE node
Show: Cloud expansion, independent pan/zoom
Action: Use breadcrumbs to navigate back
```

### 3. Performance Analysis (3 min)
```
Open: quality-performance-hints.sql
Show: Warning icons (🔄 ⬆ 📇 🚫)
Action: Press 'Q' for stats panel
Show: Performance score, complexity breakdown
```

### 4. Column Lineage (2 min)
```
Open: lineage-column-tracking.sql
Action: Press 'C' to enable column mode
Action: Click any output column
Show: Transformation path highlighting
```

### 5. Write Operations (1 min)
```
Open: demo-showcase.sql Q7, Q8, Q9
Show: Red WRITE badge (UPDATE/DELETE)
Show: Green INSERT badge
```

### 6. Workspace Analysis (3 min)
```
Action: Right-click examples folder → Analyze Dependencies
Show: Graph view with file/table nodes
Action: Click to navigate, double-click to visualize
Show: Lineage tab for upstream/downstream
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Q` | Toggle query stats panel |
| `C` | Toggle column lineage mode |
| `L` | Toggle legend |
| `H` | Switch layout (vertical/horizontal) |
| `E` | Expand/collapse all CTEs |
| `F` | Toggle fullscreen |
| `U` | Focus upstream nodes |
| `D` | Focus downstream nodes |
| `A` | Focus all connected nodes |
| `T` | Toggle theme |
| `?` | Show all shortcuts |

---

## File Dependencies

```
schema-ecommerce.sql
    └── Referenced by:
        ├── demo-showcase.sql
        ├── analytics-customer.sql
        ├── analytics-orders.sql
        └── lineage-data-pipeline.sql

lineage-data-pipeline.sql
    └── Contains multi-stage VIEW pipeline:
        raw_* → cleaned_* → aggregated_* → analytics_* → executive_*
```

---

## Notes

- **Dialect**: Files use PostgreSQL/Snowflake syntax (compatible with most dialects)
- **Date functions**: Some queries use `DATE_DIFF()`, `DATE_TRUNC()` - adjust for your dialect
- **Recursive CTEs**: `schema-ecommerce.sql` has recursive CTE for product categories
- **Performance hints**: Heuristic-based, may vary by dialect and database

---

## License

These demo files are part of the SQL Crack extension and follow the same MIT license.
