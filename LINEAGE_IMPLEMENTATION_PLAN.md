# SQL Lineage Implementation Plan

## Overview

Transform the Workspace Analysis feature from basic dependency tracking into a comprehensive **Data Lineage System** with column-level tracking, impact analysis, and interactive exploration.

---

## Architecture Principles

### Modularity Requirements
Due to token size limitations, each component must be:
- **Self-contained**: Each module in its own file with clear interfaces
- **Incrementally buildable**: Each phase delivers working functionality
- **Loosely coupled**: Modules communicate via typed interfaces
- **Independently testable**: Each module can be tested in isolation

### File Size Guidelines
- Each new file should be **< 400 lines**
- Complex logic split into helper modules
- Shared types in dedicated type files

---

## Proposed File Structure

```
src/workspace/
├── index.ts                    # Exports (existing)
├── types.ts                    # Shared types (existing, will extend)
│
├── scanner.ts                  # File scanning (existing)
├── indexManager.ts             # Index caching (existing)
├── workspacePanel.ts           # Main UI panel (existing)
│
├── extraction/                 # NEW: Modular extractors
│   ├── index.ts               # Exports
│   ├── types.ts               # Extraction types
│   ├── schemaExtractor.ts     # Existing, refactored
│   ├── referenceExtractor.ts  # Existing, refactored
│   ├── columnExtractor.ts     # NEW: Column-level extraction
│   └── transformExtractor.ts  # NEW: Transformation logic extraction
│
├── lineage/                    # NEW: Lineage engine
│   ├── index.ts               # Exports
│   ├── types.ts               # Lineage types
│   ├── lineageBuilder.ts      # Builds lineage graph from index
│   ├── columnLineage.ts       # Column-level lineage tracking
│   ├── flowAnalyzer.ts        # Upstream/downstream analysis
│   └── impactAnalyzer.ts      # Impact analysis engine
│
├── graph/                      # NEW: Graph utilities
│   ├── index.ts               # Exports
│   ├── types.ts               # Graph types
│   ├── graphBuilder.ts        # Existing dependencyGraph.ts, refactored
│   ├── layoutEngine.ts        # Layout algorithms
│   └── graphFilters.ts        # Filtering logic
│
└── ui/                         # NEW: UI components
    ├── index.ts               # Exports
    ├── types.ts               # UI types
    ├── graphRenderer.ts       # SVG rendering
    ├── tableExplorer.ts       # Table-centric view
    ├── lineageView.ts         # Lineage visualization
    └── impactView.ts          # Impact analysis view
```

---

## Phase 1: Foundation Refactoring

**Goal**: Restructure existing code for extensibility without breaking current functionality.

### 1.1 Create Extraction Module

**File: `src/workspace/extraction/types.ts`**
```typescript
// Core extraction types
export interface ColumnInfo {
  name: string;
  dataType: string;
  sourceTable?: string;      // Where this column comes from
  sourceColumn?: string;     // Original column name if aliased
  expression?: string;       // For computed columns
  isComputed: boolean;
  lineNumber: number;
}

export interface TableReference {
  tableName: string;
  alias?: string;
  schema?: string;
  columns: ColumnReference[];  // NEW: columns used from this table
  referenceType: 'select' | 'insert' | 'update' | 'delete' | 'join' | 'subquery' | 'cte';
  lineNumber: number;
  context: string;
}

export interface ColumnReference {
  columnName: string;
  alias?: string;
  tableName?: string;        // Resolved table name
  expression?: string;       // If computed
  usedIn: 'select' | 'where' | 'join' | 'group' | 'order' | 'set';
}

export interface QueryAnalysis {
  outputColumns: ColumnInfo[];      // Columns in SELECT clause
  inputReferences: TableReference[]; // Tables and columns used
  transformations: Transformation[]; // How data is transformed
  ctes: CTEDefinition[];
}

export interface Transformation {
  outputColumn: string;
  inputColumns: ColumnReference[];
  operation: string;         // 'direct' | 'concat' | 'aggregate' | 'case' | 'function'
  expression: string;
}

export interface CTEDefinition {
  name: string;
  columns: ColumnInfo[];
  query: QueryAnalysis;
  lineNumber: number;
}
```

### 1.2 Refactor Existing Extractors

**Move existing files to `extraction/` folder and update imports.**

| Current File | New Location | Changes |
|--------------|--------------|---------|
| `schemaExtractor.ts` | `extraction/schemaExtractor.ts` | Add column extraction hooks |
| `referenceExtractor.ts` | `extraction/referenceExtractor.ts` | Return `TableReference[]` with columns |

### 1.3 Deliverables
- [ ] Create `extraction/types.ts` with interfaces
- [ ] Move and refactor `schemaExtractor.ts`
- [ ] Move and refactor `referenceExtractor.ts`
- [ ] Update imports in `scanner.ts` and `indexManager.ts`
- [ ] Verify existing functionality still works

---

## Phase 2: Column-Level Extraction

**Goal**: Extract column-level information from SQL queries.

### 2.1 Column Extractor

**File: `src/workspace/extraction/columnExtractor.ts`** (~300 lines)

```typescript
export class ColumnExtractor {
  /**
   * Extract columns from SELECT clause with source tracking
   */
  extractSelectColumns(ast: any, tableAliases: Map<string, string>): ColumnInfo[];

  /**
   * Resolve column to its source table
   */
  resolveColumnSource(column: string, tableAliases: Map<string, string>): ColumnReference;

  /**
   * Extract columns used in WHERE/JOIN/GROUP BY
   */
  extractUsedColumns(ast: any, context: string): ColumnReference[];

  /**
   * Build table alias map from FROM clause
   */
  buildAliasMap(ast: any): Map<string, string>;
}
```

**Key Logic:**
```typescript
// Example: SELECT c.name, o.amount FROM customers c JOIN orders o
// Output:
// [
//   { name: 'name', sourceTable: 'customers', sourceColumn: 'name', isComputed: false },
//   { name: 'amount', sourceTable: 'orders', sourceColumn: 'amount', isComputed: false }
// ]
```

### 2.2 Transform Extractor

**File: `src/workspace/extraction/transformExtractor.ts`** (~250 lines)

```typescript
export class TransformExtractor {
  /**
   * Identify how output columns are derived from input columns
   */
  extractTransformations(ast: any): Transformation[];

  /**
   * Parse expression to identify source columns
   */
  parseExpression(expr: any): ColumnReference[];

  /**
   * Classify transformation type
   */
  classifyTransformation(expr: any): 'direct' | 'concat' | 'aggregate' | 'case' | 'function';
}
```

**Example Transformations:**
```sql
SELECT
  customer_id,                           -- direct mapping
  CONCAT(first_name, ' ', last_name),    -- concat transformation
  SUM(amount),                           -- aggregate
  CASE WHEN status = 'A' THEN 1 END      -- case transformation
```

### 2.3 Enhanced Reference Extractor

**Update: `src/workspace/extraction/referenceExtractor.ts`**

Add column tracking to existing table reference extraction:
```typescript
// Before: { tableName: 'customers', referenceType: 'select' }
// After:  { tableName: 'customers', referenceType: 'select',
//           columns: [{ columnName: 'name', usedIn: 'select' },
//                     { columnName: 'id', usedIn: 'join' }] }
```

### 2.4 Deliverables
- [ ] Create `columnExtractor.ts`
- [ ] Create `transformExtractor.ts`
- [ ] Enhance `referenceExtractor.ts` with column tracking
- [ ] Update `QueryAnalysis` in index to include column data
- [ ] Test with complex SQL queries

---

## Phase 3: Lineage Engine

**Goal**: Build the core lineage graph with column-level tracking.

### 3.1 Lineage Types

**File: `src/workspace/lineage/types.ts`**

```typescript
export interface LineageNode {
  id: string;
  type: 'table' | 'view' | 'column' | 'cte' | 'external';
  name: string;
  parentId?: string;         // For columns, points to table
  filePath?: string;
  lineNumber?: number;
  metadata: Record<string, any>;
}

export interface LineageEdge {
  id: string;
  sourceId: string;          // Source node (upstream)
  targetId: string;          // Target node (downstream)
  type: 'direct' | 'transform' | 'aggregate' | 'filter' | 'join';
  transformation?: string;   // Expression if transformed
  metadata: Record<string, any>;
}

export interface LineageGraph {
  nodes: Map<string, LineageNode>;
  edges: LineageEdge[];

  // Query methods
  getUpstream(nodeId: string, depth?: number): LineageNode[];
  getDownstream(nodeId: string, depth?: number): LineageNode[];
  getColumnLineage(tableId: string, columnName: string): LineagePath[];
}

export interface LineagePath {
  nodes: LineageNode[];
  edges: LineageEdge[];
  depth: number;
}

export interface LineageQuery {
  nodeId: string;
  direction: 'upstream' | 'downstream' | 'both';
  depth: number;             // -1 for unlimited
  includeColumns: boolean;
  filterTypes?: LineageNode['type'][];
}
```

### 3.2 Lineage Builder

**File: `src/workspace/lineage/lineageBuilder.ts`** (~350 lines)

```typescript
export class LineageBuilder {
  private nodes: Map<string, LineageNode> = new Map();
  private edges: LineageEdge[] = [];

  /**
   * Build lineage graph from workspace index
   */
  buildFromIndex(index: WorkspaceIndex): LineageGraph;

  /**
   * Add table/view definition as node
   */
  addDefinitionNode(def: TableDefinition): LineageNode;

  /**
   * Add column nodes for a table
   */
  addColumnNodes(tableName: string, columns: ColumnInfo[]): void;

  /**
   * Create edges from query analysis
   */
  addQueryEdges(query: QueryAnalysis, targetTable: string): void;

  /**
   * Resolve external references (tables not defined in workspace)
   */
  addExternalNode(tableName: string): LineageNode;
}
```

### 3.3 Column Lineage Tracker

**File: `src/workspace/lineage/columnLineage.ts`** (~300 lines)

```typescript
export class ColumnLineageTracker {
  /**
   * Trace a column back to its source(s)
   */
  traceColumnUpstream(
    graph: LineageGraph,
    tableId: string,
    columnName: string
  ): LineagePath[];

  /**
   * Trace where a column is used downstream
   */
  traceColumnDownstream(
    graph: LineageGraph,
    tableId: string,
    columnName: string
  ): LineagePath[];

  /**
   * Get full column lineage (upstream + downstream)
   */
  getFullColumnLineage(
    graph: LineageGraph,
    tableId: string,
    columnName: string
  ): {
    upstream: LineagePath[];
    downstream: LineagePath[];
  };
}
```

### 3.4 Deliverables
- [ ] Create `lineage/types.ts`
- [ ] Create `lineageBuilder.ts`
- [ ] Create `columnLineage.ts`
- [ ] Update `indexManager.ts` to build lineage graph
- [ ] Add lineage graph to workspace panel data

---

## Phase 4: Flow Analysis (Upstream/Downstream)

**Goal**: Enable directional flow exploration.

### 4.1 Flow Analyzer

**File: `src/workspace/lineage/flowAnalyzer.ts`** (~300 lines)

```typescript
export class FlowAnalyzer {
  constructor(private graph: LineageGraph) {}

  /**
   * Get all nodes upstream of a target (data sources)
   */
  getUpstream(nodeId: string, options?: FlowOptions): FlowResult;

  /**
   * Get all nodes downstream of a source (data consumers)
   */
  getDownstream(nodeId: string, options?: FlowOptions): FlowResult;

  /**
   * Get the complete data flow path between two nodes
   */
  getPathBetween(sourceId: string, targetId: string): LineagePath[];

  /**
   * Find root sources (tables with no upstream dependencies)
   */
  findRootSources(): LineageNode[];

  /**
   * Find terminal nodes (tables with no downstream consumers)
   */
  findTerminalNodes(): LineageNode[];

  /**
   * Detect circular dependencies
   */
  detectCycles(): LineagePath[];
}

export interface FlowOptions {
  maxDepth?: number;         // Limit traversal depth
  includeColumns?: boolean;  // Include column-level nodes
  filterTypes?: string[];    // Filter by node type
  excludeExternal?: boolean; // Exclude external tables
}

export interface FlowResult {
  nodes: LineageNode[];
  edges: LineageEdge[];
  paths: LineagePath[];
  depth: number;
}
```

### 4.2 Usage Examples

```typescript
// Get everything that feeds into 'daily_sales_report'
const upstream = flowAnalyzer.getUpstream('daily_sales_report', { maxDepth: 5 });

// Get everything that uses 'customers' table
const downstream = flowAnalyzer.getDownstream('customers');

// Get the path from raw_events to final_dashboard
const path = flowAnalyzer.getPathBetween('raw_events', 'final_dashboard');
```

### 4.3 Deliverables
- [ ] Create `flowAnalyzer.ts`
- [ ] Add flow analysis methods to lineage graph
- [ ] Test with multi-level dependency chains
- [ ] Add upstream/downstream filtering to UI

---

## Phase 5: Impact Analysis

**Goal**: Answer "What breaks if I change X?"

### 5.1 Impact Analyzer

**File: `src/workspace/lineage/impactAnalyzer.ts`** (~350 lines)

```typescript
export class ImpactAnalyzer {
  constructor(private graph: LineageGraph, private flowAnalyzer: FlowAnalyzer) {}

  /**
   * Analyze impact of changing a table
   */
  analyzeTableChange(tableName: string): ImpactReport;

  /**
   * Analyze impact of changing a column
   */
  analyzeColumnChange(tableName: string, columnName: string): ImpactReport;

  /**
   * Analyze impact of renaming
   */
  analyzeRename(
    type: 'table' | 'column',
    oldName: string,
    newName: string,
    tableName?: string
  ): ImpactReport;

  /**
   * Analyze impact of dropping a table/column
   */
  analyzeDrop(
    type: 'table' | 'column',
    name: string,
    tableName?: string
  ): ImpactReport;

  /**
   * Get severity of impact
   */
  calculateSeverity(impact: ImpactReport): 'low' | 'medium' | 'high' | 'critical';
}

export interface ImpactReport {
  changeType: 'modify' | 'rename' | 'drop';
  target: {
    type: 'table' | 'column';
    name: string;
    tableName?: string;
  };

  // Direct impacts (immediate dependents)
  directImpacts: ImpactItem[];

  // Transitive impacts (dependents of dependents)
  transitiveImpacts: ImpactItem[];

  // Summary
  summary: {
    totalAffected: number;
    tablesAffected: number;
    viewsAffected: number;
    queriesAffected: number;
    filesAffected: number;
  };

  severity: 'low' | 'medium' | 'high' | 'critical';

  // Suggestions
  suggestions: string[];
}

export interface ImpactItem {
  node: LineageNode;
  impactType: 'direct' | 'transitive';
  reason: string;            // Why this is affected
  filePath: string;
  lineNumber: number;
  severity: 'low' | 'medium' | 'high';
}
```

### 5.2 Severity Classification

```typescript
// Severity rules:
// - critical: Core table used by 10+ dependents
// - high: Table/column used in production views/reports
// - medium: Table/column with 3-9 dependents
// - low: Table/column with 1-2 dependents
```

### 5.3 Deliverables
- [ ] Create `impactAnalyzer.ts`
- [ ] Add impact analysis to workspace panel
- [ ] Create impact visualization UI
- [ ] Add export functionality (Markdown report)

---

## Phase 6: Graph Refactoring

**Goal**: Modularize graph building and rendering.

### 6.1 Graph Types

**File: `src/workspace/graph/types.ts`**

```typescript
export interface GraphNode {
  id: string;
  type: 'file' | 'table' | 'view' | 'column' | 'external' | 'cte';
  label: string;
  sublabel?: string;

  // Position (set by layout engine)
  x: number;
  y: number;
  width: number;
  height: number;

  // Data
  filePath?: string;
  lineNumber?: number;
  columns?: ColumnInfo[];
  metadata: Record<string, any>;

  // Visual state
  highlighted?: boolean;
  dimmed?: boolean;
  expanded?: boolean;        // For expandable nodes (show columns)
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'dependency' | 'lineage' | 'column';
  label?: string;
  metadata: Record<string, any>;
}

export interface GraphOptions {
  mode: 'file' | 'table' | 'lineage' | 'column';
  direction: 'TB' | 'LR';    // Top-bottom or Left-right
  showColumns: boolean;
  showExternal: boolean;
  maxDepth: number;
  focusNode?: string;        // Center on this node
}
```

### 6.2 Graph Builder (Refactored)

**File: `src/workspace/graph/graphBuilder.ts`** (~300 lines)

Refactor existing `dependencyGraph.ts` to use new types and support:
- File mode (existing)
- Table mode (existing)
- Lineage mode (NEW - shows data flow)
- Column mode (NEW - shows column-level dependencies)

### 6.3 Layout Engine

**File: `src/workspace/graph/layoutEngine.ts`** (~250 lines)

```typescript
export class LayoutEngine {
  /**
   * Apply hierarchical layout (existing logic)
   */
  hierarchicalLayout(nodes: GraphNode[], edges: GraphEdge[]): void;

  /**
   * Apply force-directed layout for complex graphs
   */
  forceDirectedLayout(nodes: GraphNode[], edges: GraphEdge[]): void;

  /**
   * Apply radial layout centered on a focus node
   */
  radialLayout(nodes: GraphNode[], edges: GraphEdge[], focusId: string): void;

  /**
   * Auto-select best layout based on graph characteristics
   */
  autoLayout(nodes: GraphNode[], edges: GraphEdge[]): void;
}
```

### 6.4 Graph Filters

**File: `src/workspace/graph/graphFilters.ts`** (~200 lines)

```typescript
export class GraphFilters {
  /**
   * Filter to show only upstream of a node
   */
  filterUpstream(graph: Graph, nodeId: string, depth?: number): Graph;

  /**
   * Filter to show only downstream of a node
   */
  filterDownstream(graph: Graph, nodeId: string, depth?: number): Graph;

  /**
   * Filter by node type
   */
  filterByType(graph: Graph, types: string[]): Graph;

  /**
   * Filter by search query
   */
  filterBySearch(graph: Graph, query: string, options?: SearchOptions): Graph;

  /**
   * Highlight path between two nodes
   */
  highlightPath(graph: Graph, sourceId: string, targetId: string): Graph;
}
```

### 6.5 Deliverables
- [ ] Create `graph/types.ts`
- [ ] Refactor `dependencyGraph.ts` → `graph/graphBuilder.ts`
- [ ] Create `layoutEngine.ts`
- [ ] Create `graphFilters.ts`
- [ ] Update workspace panel to use new modules

---

## Phase 7: UI Components

**Goal**: Modular UI components for different views.

### 7.1 Table Explorer (Table-Centric View)

**File: `src/workspace/ui/tableExplorer.ts`** (~300 lines)

```typescript
export class TableExplorer {
  /**
   * Generate HTML for table-centric exploration view
   */
  generateTableView(table: LineageNode, graph: LineageGraph): string;

  /**
   * Generate column list with lineage indicators
   */
  generateColumnList(columns: ColumnInfo[], lineage: ColumnLineageTracker): string;

  /**
   * Generate upstream/downstream panels
   */
  generateFlowPanels(table: LineageNode, flowAnalyzer: FlowAnalyzer): string;
}
```

**UI Features:**
- Selected table info (name, file, columns)
- Column list with source/target indicators
- Upstream panel (what feeds into this table)
- Downstream panel (what uses this table)
- Quick actions (show lineage, show impact)

### 7.2 Lineage View

**File: `src/workspace/ui/lineageView.ts`** (~300 lines)

```typescript
export class LineageView {
  /**
   * Generate lineage visualization HTML
   */
  generateLineageView(
    path: LineagePath,
    options: LineageViewOptions
  ): string;

  /**
   * Generate column lineage visualization
   */
  generateColumnLineageView(
    columnLineage: { upstream: LineagePath[]; downstream: LineagePath[] }
  ): string;

  /**
   * Generate flow diagram HTML
   */
  generateFlowDiagram(flow: FlowResult): string;
}

export interface LineageViewOptions {
  showColumns: boolean;
  showTransformations: boolean;
  highlightPath: string[];
  direction: 'horizontal' | 'vertical';
}
```

### 7.3 Impact View

**File: `src/workspace/ui/impactView.ts`** (~250 lines)

```typescript
export class ImpactView {
  /**
   * Generate impact analysis report HTML
   */
  generateImpactReport(report: ImpactReport): string;

  /**
   * Generate severity indicator
   */
  generateSeverityBadge(severity: string): string;

  /**
   * Generate affected items list
   */
  generateAffectedList(items: ImpactItem[]): string;

  /**
   * Generate export button and formats
   */
  generateExportOptions(): string;
}
```

### 7.4 Deliverables
- [ ] Create `ui/tableExplorer.ts`
- [ ] Create `ui/lineageView.ts`
- [ ] Create `ui/impactView.ts`
- [ ] Update `workspacePanel.ts` to use new UI modules
- [ ] Add view switching in sidebar

---

## Phase 8: Integration & Polish

**Goal**: Integrate all components into cohesive UX.

### 8.1 Updated Workspace Panel

Modify `workspacePanel.ts` to:
- Support multiple view modes (Graph, Lineage, Table Explorer, Impact)
- Add view mode selector in header
- Pass data to appropriate UI module based on mode
- Handle new message types for lineage/impact queries

### 8.2 New Message Types

```typescript
// New messages from webview to extension
interface LineageMessage {
  command: 'getLineage';
  nodeId: string;
  direction: 'upstream' | 'downstream' | 'both';
  depth: number;
}

interface ImpactMessage {
  command: 'analyzeImpact';
  type: 'table' | 'column';
  name: string;
  tableName?: string;
  changeType: 'modify' | 'rename' | 'drop';
}

interface ExploreTableMessage {
  command: 'exploreTable';
  tableName: string;
}

interface ColumnLineageMessage {
  command: 'getColumnLineage';
  tableName: string;
  columnName: string;
}
```

### 8.3 Sidebar Updates

Add new sections to sidebar:
- **View Mode**: Graph | Lineage | Table Explorer | Impact
- **Focus**: Selected table/column info
- **Actions**: Show Upstream | Show Downstream | Analyze Impact

### 8.4 Deliverables
- [ ] Update `workspacePanel.ts` with new view modes
- [ ] Add message handlers for lineage/impact queries
- [ ] Update sidebar with new controls
- [ ] Add view mode persistence
- [ ] Final testing and polish

---

## Implementation Order

| Phase | Name | Effort | Dependencies |
|-------|------|--------|--------------|
| 1 | Foundation Refactoring | 1-2 days | None |
| 2 | Column-Level Extraction | 2-3 days | Phase 1 |
| 3 | Lineage Engine | 2-3 days | Phase 2 |
| 4 | Flow Analysis | 1-2 days | Phase 3 |
| 5 | Impact Analysis | 2 days | Phase 4 |
| 6 | Graph Refactoring | 1-2 days | Phase 3 |
| 7 | UI Components | 2-3 days | Phase 5, 6 |
| 8 | Integration | 1-2 days | All |

**Total Estimated Effort**: 12-19 days

---

## Success Criteria

### Phase 1-2 Complete When:
- [ ] Column extraction works for SELECT/INSERT/UPDATE queries
- [ ] Column sources are tracked through joins
- [ ] Transformations (CONCAT, CASE, etc.) are identified

### Phase 3-4 Complete When:
- [ ] Lineage graph built from workspace index
- [ ] Can trace column X back to its source table(s)
- [ ] Can get all tables upstream/downstream of table Y

### Phase 5 Complete When:
- [ ] Impact report generated for table changes
- [ ] Impact report generated for column changes
- [ ] Severity classification working

### Phase 6-7 Complete When:
- [ ] Table explorer view shows upstream/downstream
- [ ] Column lineage visualized in UI
- [ ] Impact analysis displayed in UI

### Phase 8 Complete When:
- [ ] All views integrated in workspace panel
- [ ] View switching works smoothly
- [ ] All features documented

---

## API Examples

### After Full Implementation:

```typescript
// Get column lineage
const lineage = columnTracker.getFullColumnLineage(graph, 'daily_report', 'total_sales');
// Returns: { upstream: [...source columns...], downstream: [...consuming queries...] }

// Analyze impact of dropping a column
const impact = impactAnalyzer.analyzeColumnChange('orders', 'customer_id');
// Returns: { severity: 'high', directImpacts: [...], transitiveImpacts: [...] }

// Get upstream flow
const upstream = flowAnalyzer.getUpstream('final_dashboard', { maxDepth: 10 });
// Returns: { nodes: [...all source tables...], paths: [...data flow paths...] }

// Explore a table
const explorer = tableExplorer.generateTableView(table, graph);
// Returns: HTML with upstream/downstream panels, column list, actions
```

---

## Next Steps

1. **Review this plan** - Confirm scope and priorities
2. **Start Phase 1** - Foundation refactoring
3. **Iterate** - Each phase can be adjusted based on learnings

Ready to begin with Phase 1?
