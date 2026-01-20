# Plan: Column-Level Lineage Visualization

## Overview
Extend the visual lineage graph to show column-level data flow, allowing users to trace how specific columns flow through transformations from source to destination tables.

## Current State
```
┌──────────┐      ┌──────────────────┐      ┌──────────┐
│ orders   │─────▶│ customer_feedback│─────▶│ reports  │
└──────────┘      └──────────────────┘      └──────────┘
```

## Target State
```
┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│ 📊 orders           │         │ 📊 customer_feedback│         │ 📊 reports          │
│ table               │         │ table               │         │ table               │
├─────────────────────┤         ├─────────────────────┤         ├─────────────────────┤
│ ○ order_id      ────┼────────▶│ ○ order_id          │         │                     │
│ ○ customer_id   ────┼────┐    │ ○ customer_id   ────┼────────▶│ ○ customer_id       │
│ ○ amount            │    │    │ ○ feedback_text     │         │ ○ total_orders  ◀───│─ COUNT(*)
│ ○ order_date        │    │    │ ○ rating        ────┼────────▶│ ○ avg_rating        │
└─────────────────────┘    │    └─────────────────────┘         └─────────────────────┘
                           │                                              ▲
┌─────────────────────┐    │                                              │
│ 📊 customers        │    │                                              │
├─────────────────────┤    │                                              │
│ ○ customer_id   ────┼────┴──────────────────────────────────────────────┘
│ ○ name              │
│ ○ email             │
└─────────────────────┘
```

---

## Architecture

### Data Model Changes

#### 1. Enhance `LineageNode` for Columns
```typescript
// src/workspace/lineage/types.ts

interface ColumnLineageInfo {
    sourceColumns: ColumnReference[];      // Where this column gets its data
    transformationType: TransformationType; // How data is transformed
    expression?: string;                    // Original SQL expression
    isComputed: boolean;                    // true if derived (SUM, CONCAT, etc.)
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    referencedTable?: string;               // For foreign keys
}

interface ColumnReference {
    tableId: string;
    tableName: string;
    columnName: string;
    filePath?: string;
    lineNumber?: number;
}

type TransformationType =
    | 'direct'      // column_a → column_a (same name, passthrough)
    | 'rename'      // column_a AS column_b
    | 'aggregate'   // SUM(amount), COUNT(*), AVG(rating)
    | 'expression'  // CONCAT(first_name, last_name)
    | 'case'        // CASE WHEN ... END
    | 'cast'        // CAST(x AS INT)
    | 'coalesce'    // COALESCE(a, b, c)
    | 'join'        // Column used in JOIN condition
    | 'filter'      // Column used in WHERE clause
    | 'unknown';
```

#### 2. Add Column-to-Column Edges
```typescript
// src/workspace/lineage/types.ts

interface ColumnLineageEdge {
    id: string;
    sourceTableId: string;
    sourceColumnName: string;
    targetTableId: string;
    targetColumnName: string;
    transformationType: TransformationType;
    expression?: string;
    filePath: string;
    lineNumber: number;
}

// Extend LineageGraph
interface LineageGraph {
    nodes: Map<string, LineageNode>;
    edges: LineageEdge[];
    columnEdges: ColumnLineageEdge[];  // NEW
}
```

---

### Phase 1: Column Extraction & Tracking

**Files to modify:**
- `src/workspace/lineage/lineageBuilder.ts`
- `src/workspace/lineage/types.ts`
- `src/analysis/sqlAnalyzer.ts`

#### 1.1 Parse SELECT Columns
Extract column information from SELECT statements:

```sql
SELECT
    o.order_id,                           -- direct: orders.order_id → result.order_id
    c.name AS customer_name,              -- rename: customers.name → result.customer_name
    SUM(o.amount) AS total_amount,        -- aggregate: orders.amount → result.total_amount
    CONCAT(c.first, ' ', c.last) AS full  -- expression: customers.first + customers.last → result.full
FROM orders o
JOIN customers c ON o.customer_id = c.id
```

**Implementation approach:**
```typescript
interface ParsedSelectColumn {
    alias: string;                    // Output column name
    sourceColumns: string[];          // Input columns referenced
    expression: string;               // Original SQL expression
    transformationType: TransformationType;
    aggregateFunction?: string;       // SUM, COUNT, AVG, etc.
}

function parseSelectColumns(ast: AST): ParsedSelectColumn[] {
    // Walk AST to extract column references
    // Handle: column_ref, function calls, binary expressions, case statements
}
```

#### 1.2 Track Column Flow Through CTEs
```sql
WITH order_totals AS (
    SELECT customer_id, SUM(amount) as total  -- Track: orders.amount → order_totals.total
    FROM orders
    GROUP BY customer_id
)
SELECT c.name, ot.total                       -- Track: order_totals.total → result.total
FROM customers c
JOIN order_totals ot ON c.id = ot.customer_id
```

#### 1.3 Handle INSERT/UPDATE Column Mapping
```sql
INSERT INTO summary (customer_id, order_count, total_amount)
SELECT
    customer_id,           -- orders.customer_id → summary.customer_id
    COUNT(*),              -- orders.* → summary.order_count
    SUM(amount)            -- orders.amount → summary.total_amount
FROM orders
GROUP BY customer_id;
```

---

### Phase 2: Column Lineage Graph Builder

**New file:** `src/workspace/lineage/columnLineageBuilder.ts`

```typescript
class ColumnLineageBuilder {
    /**
     * Build column-level lineage from a SQL statement
     */
    buildFromStatement(
        statement: ParsedStatement,
        tableLineage: LineageGraph
    ): ColumnLineageEdge[] {
        // 1. Parse SELECT columns
        // 2. Resolve table aliases
        // 3. Track column references through JOINs
        // 4. Handle subqueries recursively
        // 5. Build column edges
    }

    /**
     * Get upstream columns for a specific column
     */
    getColumnUpstream(
        tableId: string,
        columnName: string,
        depth: number = 10
    ): ColumnLineagePath[] {
        // BFS/DFS through column edges
    }

    /**
     * Get downstream columns that depend on a specific column
     */
    getColumnDownstream(
        tableId: string,
        columnName: string,
        depth: number = 10
    ): ColumnLineagePath[] {
        // Reverse traversal
    }
}
```

---

### Phase 3: UI - Expandable Nodes

**Files to modify:**
- `src/workspace/ui/lineageGraphRenderer.ts`
- `src/workspace/ui/lineageView.ts`
- `src/workspace/workspacePanel.ts` (CSS + JS)

#### 3.1 Node States

```
┌─ Collapsed (default) ─────────┐
│ 📊 customers                  │
│ table · 5 columns             │
│ [+] Show columns              │
└───────────────────────────────┘

┌─ Expanded ────────────────────┐
│ 📊 customers                  │
│ table                         │
├───────────────────────────────┤
│ ◉ customer_id    INT    PK   │ ← Highlighted if selected
│ ○ name           VARCHAR     │
│ ○ email          VARCHAR     │
│ ○ region         VARCHAR     │
│ ○ created_at     TIMESTAMP   │
├───────────────────────────────┤
│ [−] Hide columns              │
└───────────────────────────────┘
```

#### 3.2 Column Interaction States

| State | Visual | Meaning |
|-------|--------|---------|
| Default | `○ column_name` | Normal column |
| Selected | `◉ column_name` (highlighted) | User clicked to trace lineage |
| Source | `● column_name` (green) | Upstream source of selected |
| Target | `● column_name` (blue) | Downstream consumer of selected |
| Dimmed | `○ column_name` (opacity 0.3) | Not in lineage path |

#### 3.3 Dynamic Node Height
```typescript
const NODE_HEIGHT_COLLAPSED = 60;
const NODE_HEIGHT_HEADER = 50;
const NODE_HEIGHT_PER_COLUMN = 24;
const NODE_HEIGHT_FOOTER = 30;

function calculateNodeHeight(node: GraphNode): number {
    if (!node.expanded) return NODE_HEIGHT_COLLAPSED;
    return NODE_HEIGHT_HEADER
         + (node.columns.length * NODE_HEIGHT_PER_COLUMN)
         + NODE_HEIGHT_FOOTER;
}
```

---

### Phase 4: Column-Level Edges

#### 4.1 Edge Rendering
When a column is selected, draw edges between specific columns:

```typescript
interface ColumnEdgeRender {
    sourceNode: string;
    sourceColumn: string;
    sourceY: number;      // Y position of source column row
    targetNode: string;
    targetColumn: string;
    targetY: number;      // Y position of target column row
    type: TransformationType;
}

function renderColumnEdge(edge: ColumnEdgeRender): string {
    // Draw bezier curve from source column row to target column row
    // Use different colors/styles based on transformation type
}
```

#### 4.2 Edge Styles by Transformation Type

| Type | Style | Color |
|------|-------|-------|
| direct | Solid line | Gray (#64748b) |
| rename | Solid line + "AS" label | Gray |
| aggregate | Thick line + function icon | Orange (#f59e0b) |
| expression | Dashed line | Purple (#a78bfa) |
| join | Line with diamond | Blue (#3b82f6) |
| filter | Dotted line | Red (#ef4444) |

#### 4.3 Edge Labels (on hover)
```
┌─────────────────────────────┐
│ SUM(orders.amount)          │
│ ─────────────────────────── │
│ Type: aggregate             │
│ File: summary.sql:42        │
└─────────────────────────────┘
```

---

### Phase 5: Column Selection & Tracing

#### 5.1 Click Column to Trace
When user clicks a column:
1. Highlight the selected column
2. Find all upstream source columns
3. Find all downstream target columns
4. Dim all other columns
5. Draw column-level edges
6. Auto-expand nodes that contain traced columns

#### 5.2 Trace Visualization

```
Selected: customer_feedback.customer_id

Upstream path:
  orders.customer_id ──▶ customer_feedback.customer_id
  customers.id ──▶ customer_feedback.customer_id (via JOIN)

Downstream path:
  customer_feedback.customer_id ──▶ reports.customer_id
  customer_feedback.customer_id ──▶ dashboard.customer_dim_id
```

#### 5.3 Info Panel (optional sidebar)
When a column is selected, show detailed lineage info:

```
┌─ Column Lineage ──────────────────┐
│ customer_feedback.customer_id     │
│ ────────────────────────────────  │
│ Type: INT                         │
│ Nullable: NO                      │
│                                   │
│ ⬆ Sources (2):                    │
│   • orders.customer_id            │
│     direct passthrough            │
│   • customers.id                  │
│     JOIN condition                │
│                                   │
│ ⬇ Consumers (3):                  │
│   • reports.customer_id           │
│   • dashboard.customer_dim_id     │
│   • alerts.cust_id (renamed)      │
└───────────────────────────────────┘
```

---

### Phase 6: Performance Optimization

#### 6.1 Lazy Column Loading
Don't load column data until node is expanded:
```typescript
// Only fetch columns when user expands a node
async function handleExpandNode(nodeId: string) {
    const columns = await vscode.postMessage({
        command: 'getNodeColumns',
        nodeId
    });
    // Re-render node with columns
}
```

#### 6.2 Column Edge Caching
Cache column lineage calculations:
```typescript
class ColumnLineageCache {
    private cache: Map<string, ColumnLineagePath[]> = new Map();

    getOrCompute(tableId: string, columnName: string): ColumnLineagePath[] {
        const key = `${tableId}:${columnName}`;
        if (!this.cache.has(key)) {
            this.cache.set(key, this.computeLineage(tableId, columnName));
        }
        return this.cache.get(key)!;
    }
}
```

#### 6.3 Virtual Rendering for Many Columns
For tables with 50+ columns, use virtual scrolling:
```typescript
const MAX_VISIBLE_COLUMNS = 20;

function renderColumnList(columns: Column[], scrollOffset: number) {
    const visible = columns.slice(scrollOffset, scrollOffset + MAX_VISIBLE_COLUMNS);
    // Render only visible columns with scroll container
}
```

---

### Phase 7: Message Protocol

#### New Messages (webview → extension)

| Command | Payload | Description |
|---------|---------|-------------|
| `expandNodeColumns` | `{ nodeId }` | Expand node to show columns |
| `collapseNodeColumns` | `{ nodeId }` | Collapse node |
| `selectColumn` | `{ tableId, columnName }` | Trace column lineage |
| `clearColumnSelection` | `{}` | Clear column highlight |
| `getColumnLineage` | `{ tableId, columnName, direction }` | Get full column lineage |

#### New Messages (extension → webview)

| Command | Payload | Description |
|---------|---------|-------------|
| `nodeColumnsResult` | `{ nodeId, columns[] }` | Column data for expanded node |
| `columnLineageResult` | `{ upstream[], downstream[], edges[] }` | Column lineage paths |

---

### Phase 8: SQL Parser Enhancements

#### 8.1 Column Reference Extraction
Enhance AST walking to extract all column references:

```typescript
function extractColumnReferences(expr: Expression): ColumnRef[] {
    switch (expr.type) {
        case 'column_ref':
            return [{ table: expr.table, column: expr.column }];
        case 'function':
            // Recurse into function arguments
            return expr.args.flatMap(extractColumnReferences);
        case 'binary_expr':
            return [
                ...extractColumnReferences(expr.left),
                ...extractColumnReferences(expr.right)
            ];
        case 'case':
            // Handle CASE WHEN ... END
        case 'cast':
            return extractColumnReferences(expr.expr);
        // ... handle all expression types
    }
}
```

#### 8.2 Alias Resolution
Track table aliases to resolve column sources:

```typescript
interface AliasMap {
    [alias: string]: {
        type: 'table' | 'subquery' | 'cte';
        name: string;
        columns?: Column[];  // For subqueries/CTEs
    };
}

function buildAliasMap(fromClause: FromClause): AliasMap {
    // Build map from SELECT ... FROM table AS alias
}

function resolveColumn(ref: ColumnRef, aliases: AliasMap): ResolvedColumn {
    // Resolve alias.column to actual_table.column
}
```

---

## Implementation Order

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 1 | Column extraction from SQL | High | SQL parser |
| 2 | Column lineage graph builder | High | Phase 1 |
| 3 | Expandable node UI | Medium | None |
| 4 | Column edge rendering | Medium | Phase 3 |
| 5 | Column selection & tracing | Medium | Phase 2, 4 |
| 6 | Performance optimization | Low | Phase 5 |
| 7 | Message protocol | Low | Parallel |
| 8 | SQL parser enhancements | High | Phase 1 |

**Recommended order:** 3 → 7 → 1 → 8 → 2 → 4 → 5 → 6

Start with UI (expandable nodes) to validate the UX, then build the backend column tracking.

---

## Edge Cases to Handle

1. **SELECT *** - Expand to all columns from source tables
2. **Subqueries** - Track columns through nested queries
3. **UNION/INTERSECT** - Map columns by position
4. **Window functions** - OVER(PARTITION BY ...) references
5. **Implicit columns** - `INSERT INTO t VALUES (...)` without column list
6. **JSON/Array access** - `data->>'field'` in PostgreSQL
7. **Dynamic SQL** - Can't trace, mark as "unknown source"
8. **External tables** - Mark columns as "external/unknown"

---

## Testing Plan

1. **Unit tests** for column extraction from various SQL patterns
2. **Integration tests** for end-to-end column lineage
3. **Visual tests**:
   - Expand/collapse nodes
   - Click column to trace
   - Verify edge routing doesn't overlap
   - Test with 50+ column tables
4. **Edge cases**:
   - Circular references (CTE referencing itself)
   - Self-joins
   - Same column name in multiple tables

---

## Mockup

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Lineage: customer_feedback                                           [−][□][×] │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ◀ Back   📊 customer_feedback   table   ⬆1 upstream  ⬇3 downstream             │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [Upstream Only] [Both ✓] [Downstream Only]     Column: customer_id (selected)  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐                                                            │
│  │ 📊 orders       │                                                            │
│  │ table           │                                                            │
│  ├─────────────────┤         ┌─────────────────────┐         ┌────────────────┐ │
│  │ ● order_id     ─┼────────▶│ 📊 customer_feedback│────────▶│ 📊 reports     │ │
│  │ ● customer_id  ─┼────┐    ├─────────────────────┤         ├────────────────┤ │
│  │ ○ amount        │    │    │ ○ feedback_id       │         │ ● customer_id  │ │
│  │ ○ order_date    │    ├───▶│ ◉ customer_id ──────┼────────▶│ ○ report_date  │ │
│  │ [−] Hide        │    │    │ ○ order_id          │         │ ○ total_orders │ │
│  └─────────────────┘    │    │ ○ rating            │         │ [+] Show cols  │ │
│                         │    │ [−] Hide            │         └────────────────┘ │
│  ┌─────────────────┐    │    └─────────────────────┘                            │
│  │ 📊 customers    │    │                                                       │
│  ├─────────────────┤    │                                                       │
│  │ ● id           ─┼────┘                                                       │
│  │ ○ name          │                                                            │
│  │ ○ email         │         Legend: ● = in lineage path  ○ = not in path      │
│  │ [−] Hide        │                 ◉ = selected column                        │
│  └─────────────────┘                                                            │
│                                                                                 │
│ ─────────────────────────────────────────────────────────────────────────────── │
│ Column: customer_id | Sources: orders.customer_id, customers.id | [Zoom: 100%] │
└─────────────────────────────────────────────────────────────────────────────────┘
```
