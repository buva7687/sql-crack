# SQL Crack Demo Files

This directory contains comprehensive demo files showcasing all features of the SQL Crack extension.

## 📁 Files Overview

### Main Demo File
**`demo-showcase.sql`** - Complete feature showcase (9 queries)
- **Recommended for:** Product demos, tutorials, feature walkthroughs
- **Dialect:** PostgreSQL / Snowflake
- **Queries:** 9 comprehensive analytical queries
- **Features demonstrated:** ALL extension features

### Schema Definition Files
**`customer-schema.sql`** - Customer domain tables and views
- Tables: `customers`, `customer_segments`, `customer_feedback`, `customer_support`
- Views: `customer_segments`

**`product-schema.sql`** - Product domain tables and views
- Tables: `products`, `inventory`, `reviews`, `suppliers`, `product_suppliers`
- Views: `product_categories` (recursive CTE)

**`order-schema.sql`** - Order domain tables and views
- Tables: `orders`, `order_items`, `order_status_history`, `order_returns`, `daily_sales_summary`
- Views: `order_analytics`, `regional_performance`

### Analytics Query Files
**`customer-analytics.sql`** - Customer-focused analytical queries (4 queries)
- Customer lifetime value by region
- Customer retention/cohort analysis
- High-value customer identification (RFM analysis)
- Customer feedback and NPS analysis

**`order-analytics.sql`** - Order-focused analytical queries (4 queries)
- Daily order trends with week-over-week comparison
- Product sales performance ranking
- Order fulfillment analysis
- Cross-selling opportunity analysis

---

## 🎯 Feature Coverage Matrix

| Feature | demo-showcase.sql | customer-analytics.sql | order-analytics.sql |
|---------|------------------|----------------------|-------------------|
| **Phase 1: Interactive Navigation** |
| Click-to-jump navigation | ✅ | ✅ | ✅ |
| Edge condition display | ✅ | ✅ | ✅ |
| Breadcrumb navigation | ✅ | ✅ | ✅ |
| Enhanced tooltips | ✅ | ✅ | ✅ |
| Read vs Write badges | ✅ | ✅ | ✅ |
| **Phase 2: Developer Productivity** |
| Unused CTE warnings | ✅ | ✅ | ✅ |
| Dead column detection | ✅ | ✅ | ✅ |
| Duplicate subquery detection | ✅ | ✅ | ✅ |
| Repeated table scan warnings | ✅ | ✅ | ✅ |
| Query complexity insights | ✅ | ✅ | ✅ |
| Column lineage tracing | ✅ | ✅ | ✅ |
| CTE cloud expansion | ✅ | ✅ | ✅ |
| Independent cloud pan/zoom | ✅ | ✅ | ✅ |
| **Phase 3: Performance Analysis** |
| Filter pushdown detection | ✅ | ✅ | ✅ |
| Non-sargable expressions | ✅ | ✅ | ✅ |
| Index suggestions | ✅ | ✅ | ✅ |
| Subquery to JOIN hints | ✅ | ✅ | ✅ |
| Performance score (0-100) | ✅ | ✅ | ✅ |
| **Additional Features** |
| Multi-query support (tabs) | ✅ (9 queries) | ✅ (4 queries) | ✅ (4 queries) |
| Operation type badges | ✅ | ✅ | ✅ |
| Complex JOINs with Venn diagrams | ✅ | ✅ | ✅ |
| Window functions | ✅ | ✅ | ✅ |
| CASE statements | ✅ | ✅ | ✅ |
| UNION queries | ✅ | ✅ | ✅ |
| HAVING clauses | ✅ | ✅ | ✅ |
| Correlated subqueries | ✅ | ✅ | ✅ |
| EXISTS subqueries | ✅ | ✅ | ✅ |
| **Phase 4: Workspace Analysis** |
| Cross-file dependencies | ✅ | ✅ | ✅ |
| Table/view relationships | ✅ | ✅ | ✅ |
| Schema definitions | ✅ | ✅ | ✅ |
| Reference tracking | ✅ | ✅ | ✅ |

---

## 🎬 Demo Script Suggestions

### Quick Feature Overview (5 minutes)
1. Open `demo-showcase.sql`
2. Click "Visualize SQL" button
3. Show multi-query tabs (Q1-Q9)
4. Navigate through Query 1:
   - Double-click CTEs to expand clouds
   - Click nodes to jump to SQL
   - Click edges to see JOIN conditions
   - Use breadcrumb to navigate back

### Performance Analysis Demo (3 minutes)
1. Navigate to Query 2 (Product Performance)
2. Point out warning icons:
   - 🔄 Repeated table scans (3 subqueries)
   - ⬆ Filter pushdown opportunity
   - 📇 Index suggestions on WHERE clauses
3. Press 'Q' to toggle query stats panel
4. Show performance score and complexity breakdown

### Quality & Annotations Demo (3 minutes)
1. Navigate to Query 1 (Customer Lifecycle)
2. Show unused CTE warning badge
3. Point out dead columns in SELECT
4. Press 'C' to enable column lineage mode
5. Click an output column to trace its transformation

### Write Operations Demo (2 minutes)
1. Navigate to Query 7 (UPDATE) - show red WRITE badge
2. Navigate to Query 8 (DELETE) - show red DELETE badge
3. Navigate to Query 9 (INSERT) - show green INSERT badge
4. Show operation type badges

### Workspace Analysis Demo (5 minutes)
1. Right-click examples folder → "Analyze Workspace Dependencies"
2. Show file-to-file dependency graph
3. Switch to Tables mode to see table relationships
4. Click any file/table to open it
5. Double-click to visualize its SQL
6. Show statistics panel with orphaned/missing definitions

### Interactive Features Demo (3 minutes)
1. Press 'H' to switch layout (vertical ↔ horizontal)
2. Press 'E' to expand/collapse all CTEs
3. Press 'L' to toggle legend
4. Use mouse wheel to zoom in/out
5. Drag canvas to pan around
6. Press 'F' for focus mode (upstream/downstream)

---

## 📊 Query-by-Query Breakdown

### demo-showcase.sql

**Query 1: Customer Lifecycle Analysis** (Lines 27-120)
- CTEs: 4 (customer_journey, customer_segments, regional_metrics, high_value_customers)
- Features: Unused CTE warning, dead columns, window functions, CASE statements
- Demo: CTE expansion, column lineage, breadcrumbs

**Query 2: Product Performance** (Lines 126-165)
- Features: Repeated table scans (🔄), filter pushdown (⬆), index suggestions (📇)
- Demo: Performance hints, subquery to JOIN conversion

**Query 3: Revenue Trend** (Lines 171-228)
- Features: Window functions with running totals, year-over-year calculations
- Demo: Complex expressions, aggregations

**Query 4: Product Recommendations** (Lines 234-268)
- Features: Self-joins, EXISTS subqueries, correlated subqueries
- Demo: Complex JOIN visualization

**Query 5: Inventory Optimization** (Lines 274-330)
- Features: UNION queries, unused CTE, HAVING clause
- Demo: Query complexity, union visualization

**Query 6: Churn Risk Analysis** (Lines 336-380)
- Features: Complex aggregations, HAVING clause, multiple CASE statements
- Demo: Quality analysis, metrics

**Query 7: Update High-Value Customers** (Lines 386-406)
- Features: UPDATE with JOIN, WRITE operation badge (red)
- Demo: Write operation visualization

**Query 8: Delete Stale Data** (Lines 412-422)
- Features: DELETE with subquery, proper WHERE clause
- Demo: DELETE operation badge (red)

**Query 9: Insert Daily Summary** (Lines 428-456)
- Features: INSERT ... SELECT, subquery in SELECT list
- Demo: INSERT operation badge (green)

### customer-analytics.sql

**Query 1: Customer LTV by Region**
- Features: GROUP BY with ROLLUP-style aggregation, COALESCE

**Query 2: Customer Retention/Cohort Analysis**
- Features: Cohort analysis, retention matrix calculation

**Query 3: High-Value Customer (RFM)**
- Features: RFM segmentation, complex CASE logic

**Query 4: Customer Feedback & NPS**
- Features: NPS calculation, window functions

### order-analytics.sql

**Query 1: Daily Trends with WoW Comparison**
- Features: LAG window function, week-over-week growth

**Query 2: Product Sales Ranking**
- Features: RANK() function, profitability analysis

**Query 3: Order Fulfillment**
- Features: Aging analysis, performance metrics

**Query 4: Cross-Selling Analysis**
- Features: Self-join for product pairs, confidence calculation

---

## 🔧 How to Use

### For Product Demos
1. Use `demo-showcase.sql` - it has everything in one file
2. Start with Query 1 to show basic features
3. Move to Query 2 for performance analysis
4. Show Queries 7-9 for write operations
5. Use workspace analysis to show cross-file dependencies

### For Testing Specific Features
- **CTE expansion:** Query 1 (demo-showcase.sql)
- **Performance hints:** Query 2 (demo-showcase.sql)
- **Column lineage:** Query 1 (demo-showcase.sql)
- **Window functions:** Query 3 (demo-showcase.sql)
- **UNION queries:** Query 5 (demo-showcase.sql)
- **Workspace analysis:** Use all schema files + analytics files

### For Tutorial Videos
1. **Introduction:** demo-showcase.sql Query 1
2. **Performance Analysis:** demo-showcase.sql Query 2
3. **Quality Analysis:** demo-showcase.sql Query 1
4. **Workspace Demo:** All schema files + analytics files
5. **Advanced Features:** customer-analytics.sql or order-analytics.sql

---

## 💡 Tips for Demo Recording

1. **Set dialect to PostgreSQL or Snowflake** before visualizing
2. **Use keyboard shortcuts** for smoother demo flow:
   - `Q` - Toggle query stats
   - `C` - Toggle column lineage
   - `L` - Toggle legend
   - `H` - Switch layout
   - `E` - Expand/collapse CTEs

3. **Highlight features as you go:**
   - Point out warning badges (⚠️, 🔄, ⬆, 📇, 🚫)
   - Mention node colors (blue=READ, red=WRITE, purple=CTE)
   - Show edge colors (grey=SELECT, purple=JOIN, etc.)

4. **Use focus mode** (`F`) to highlight related nodes
5. **Double-click CTEs** to show cloud expansion
6. **Click edges** to show SQL clauses panel

---

## 🐛 Known Issues / Notes

- Some queries use `DATE_DIFF()` function - ensure your dialect supports it
- Recursive CTE in `product-schema.sql` requires PostgreSQL or Snowflake
- Window function syntax varies by dialect - files use standard SQL
- Performance hints are heuristic-based and may not apply to all dialects

---

## 📝 License

These demo files are part of the SQL Crack extension and follow the same MIT license.
