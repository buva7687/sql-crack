# SQL Crack: Testing & Performance Optimization Plan

## Overview

This document outlines the implementation plan for:
1. **Testing Infrastructure** - Unit, integration, and E2E tests
2. **Performance Optimization** - Code splitting, virtualization, lazy loading

---

## Phase 1: Testing Infrastructure

### 1.1 Setup (Priority: High)

**Install Dependencies:**
```bash
npm install -D jest ts-jest @types/jest @vscode/test-electron
```

**Files to Create:**
```
tests/
├── unit/
│   ├── parser/
│   │   ├── sqlParser.test.ts       # Core SQL parsing
│   │   ├── dialectSupport.test.ts  # Dialect-specific syntax
│   │   └── batchParsing.test.ts    # Multi-statement handling
│   ├── lineage/
│   │   ├── columnFlows.test.ts     # Column lineage tracking
│   │   └── columnLineage.test.ts   # Legacy lineage
│   └── workspace/
│       ├── scanner.test.ts         # File scanning
│       └── indexManager.test.ts    # Index operations
├── integration/
│   ├── visualization.test.ts       # End-to-end visualization
│   └── workspace.test.ts           # Workspace analysis
├── fixtures/
│   ├── mysql/                      # MySQL test SQL files
│   ├── postgres/                   # PostgreSQL test files
│   ├── snowflake/                  # Snowflake test files
│   └── edge-cases/                 # Error handling cases
├── jest.config.js
└── setup.ts
```

**jest.config.js:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/webview/ui/**'  // UI code harder to unit test
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
};
```

**package.json additions:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --reporters=default --reporters=jest-junit"
  }
}
```

### 1.2 Unit Tests - Parser (Priority: High)

**tests/unit/parser/sqlParser.test.ts:**
```typescript
import { parseSqlBatch, parseSql } from '../../../src/webview/sqlParser';

describe('SQL Parser', () => {
  describe('Basic SELECT', () => {
    it('parses simple SELECT with single table', () => {
      const result = parseSql('SELECT * FROM users', 'MySQL');
      expect(result.nodes).toContainEqual(
        expect.objectContaining({ type: 'table', label: 'users' })
      );
      expect(result.error).toBeUndefined();
    });

    it('parses SELECT with specific columns', () => {
      const result = parseSql('SELECT id, name FROM users', 'MySQL');
      expect(result.nodes.find(n => n.type === 'result')).toBeDefined();
    });

    it('parses SELECT with WHERE clause', () => {
      const result = parseSql('SELECT * FROM users WHERE active = 1', 'MySQL');
      expect(result.nodes).toContainEqual(
        expect.objectContaining({ type: 'filter' })
      );
    });
  });

  describe('JOINs', () => {
    it('parses INNER JOIN', () => {
      const sql = 'SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id';
      const result = parseSql(sql, 'MySQL');
      expect(result.nodes).toContainEqual(
        expect.objectContaining({ type: 'join' })
      );
    });

    it('parses LEFT JOIN', () => {
      const sql = 'SELECT * FROM orders o LEFT JOIN customers c ON o.customer_id = c.id';
      const result = parseSql(sql, 'MySQL');
      const joinNode = result.nodes.find(n => n.type === 'join');
      expect(joinNode?.metadata?.joinType).toBe('LEFT');
    });

    it('parses multiple JOINs', () => {
      const sql = `
        SELECT * FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN products p ON o.product_id = p.id
      `;
      const result = parseSql(sql, 'MySQL');
      const joinNodes = result.nodes.filter(n => n.type === 'join');
      expect(joinNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('CTEs', () => {
    it('parses simple CTE', () => {
      const sql = `
        WITH active_users AS (SELECT * FROM users WHERE active = 1)
        SELECT * FROM active_users
      `;
      const result = parseSql(sql, 'MySQL');
      expect(result.nodes).toContainEqual(
        expect.objectContaining({ type: 'cte', label: expect.stringContaining('active_users') })
      );
    });

    it('parses chained CTEs', () => {
      const sql = `
        WITH
          cte1 AS (SELECT * FROM t1),
          cte2 AS (SELECT * FROM cte1)
        SELECT * FROM cte2
      `;
      const result = parseSql(sql, 'MySQL');
      const cteNodes = result.nodes.filter(n => n.type === 'cte');
      expect(cteNodes.length).toBe(2);
    });

    it('parses recursive CTE', () => {
      const sql = `
        WITH RECURSIVE nums AS (
          SELECT 1 AS n
          UNION ALL
          SELECT n + 1 FROM nums WHERE n < 10
        )
        SELECT * FROM nums
      `;
      const result = parseSql(sql, 'PostgreSQL');
      expect(result.nodes).toContainEqual(
        expect.objectContaining({ type: 'cte' })
      );
    });
  });

  describe('Aggregations', () => {
    it('parses GROUP BY', () => {
      const sql = 'SELECT department, COUNT(*) FROM employees GROUP BY department';
      const result = parseSql(sql, 'MySQL');
      expect(result.nodes).toContainEqual(
        expect.objectContaining({ type: 'aggregate' })
      );
    });

    it('parses HAVING clause', () => {
      const sql = 'SELECT department, COUNT(*) FROM employees GROUP BY department HAVING COUNT(*) > 5';
      const result = parseSql(sql, 'MySQL');
      expect(result.nodes.some(n => n.type === 'aggregate')).toBe(true);
    });
  });

  describe('Window Functions', () => {
    it('parses ROW_NUMBER()', () => {
      const sql = 'SELECT *, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) FROM employees';
      const result = parseSql(sql, 'MySQL');
      expect(result.nodes).toContainEqual(
        expect.objectContaining({ type: 'window' })
      );
    });
  });

  describe('Error Handling', () => {
    it('returns error for invalid SQL', () => {
      const result = parseSql('SELEC * FORM users', 'MySQL');
      expect(result.error).toBeDefined();
    });

    it('returns partial results for batch with errors', () => {
      const sql = `
        SELECT * FROM users;
        INVALID SQL HERE;
        SELECT * FROM orders;
      `;
      const result = parseSqlBatch(sql, 'MySQL');
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
    });
  });
});
```

**tests/unit/parser/dialectSupport.test.ts:**
```typescript
import { parseSql } from '../../../src/webview/sqlParser';

describe('Dialect Support', () => {
  describe('MySQL', () => {
    it('parses backtick identifiers', () => {
      const result = parseSql('SELECT `user-name` FROM `my-table`', 'MySQL');
      expect(result.error).toBeUndefined();
    });

    it('parses LIMIT without OFFSET keyword', () => {
      const result = parseSql('SELECT * FROM users LIMIT 10, 20', 'MySQL');
      expect(result.error).toBeUndefined();
    });
  });

  describe('PostgreSQL', () => {
    it('parses double-quoted identifiers', () => {
      const result = parseSql('SELECT "user-name" FROM "my-table"', 'PostgreSQL');
      expect(result.error).toBeUndefined();
    });

    it('parses :: type casting', () => {
      const result = parseSql("SELECT '2024-01-01'::date", 'PostgreSQL');
      expect(result.error).toBeUndefined();
    });

    it('parses ARRAY syntax', () => {
      const result = parseSql('SELECT ARRAY[1, 2, 3]', 'PostgreSQL');
      expect(result.error).toBeUndefined();
    });
  });

  describe('Snowflake', () => {
    it('parses FLATTEN', () => {
      const result = parseSql('SELECT * FROM table1, LATERAL FLATTEN(input => col1)', 'Snowflake');
      // May or may not parse depending on node-sql-parser support
      // Test documents expected behavior
    });

    it('parses QUALIFY clause', () => {
      const result = parseSql(`
        SELECT * FROM t
        QUALIFY ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) = 1
      `, 'Snowflake');
      expect(result.error).toBeUndefined();
    });
  });

  describe('BigQuery', () => {
    it('parses STRUCT syntax', () => {
      const result = parseSql('SELECT STRUCT(1 AS a, 2 AS b)', 'BigQuery');
      // Document expected behavior
    });
  });
});
```

### 1.3 Unit Tests - Column Lineage (Priority: Medium)

**tests/unit/lineage/columnFlows.test.ts:**
```typescript
import { parseSql } from '../../../src/webview/sqlParser';

describe('Column Lineage', () => {
  describe('Direct Passthrough', () => {
    it('tracks column from single table', () => {
      const result = parseSql('SELECT id, name FROM users', 'MySQL');
      expect(result.columnFlows).toBeDefined();
      const idFlow = result.columnFlows?.find(f => f.outputColumn === 'id');
      expect(idFlow?.lineagePath).toContainEqual(
        expect.objectContaining({ transformation: 'source' })
      );
    });
  });

  describe('Renamed Columns', () => {
    it('tracks aliased columns', () => {
      const result = parseSql('SELECT id AS user_id FROM users', 'MySQL');
      const flow = result.columnFlows?.find(f => f.outputColumn === 'user_id');
      expect(flow?.lineagePath).toContainEqual(
        expect.objectContaining({ transformation: 'renamed' })
      );
    });
  });

  describe('Aggregated Columns', () => {
    it('tracks aggregated columns', () => {
      const result = parseSql('SELECT COUNT(*) AS total FROM users', 'MySQL');
      const flow = result.columnFlows?.find(f => f.outputColumn === 'total');
      expect(flow?.lineagePath).toContainEqual(
        expect.objectContaining({ transformation: 'aggregated' })
      );
    });
  });

  describe('Calculated Columns', () => {
    it('tracks expressions', () => {
      const result = parseSql('SELECT price * quantity AS total FROM orders', 'MySQL');
      const flow = result.columnFlows?.find(f => f.outputColumn === 'total');
      expect(flow?.lineagePath).toContainEqual(
        expect.objectContaining({ transformation: 'calculated' })
      );
    });
  });

  describe('Through JOINs', () => {
    it('tracks columns through JOIN', () => {
      const sql = `
        SELECT o.id, c.name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
      `;
      const result = parseSql(sql, 'MySQL');
      expect(result.columnFlows?.length).toBeGreaterThan(0);
    });
  });
});
```

### 1.4 Unit Tests - Workspace (Priority: Medium)

**tests/unit/workspace/scanner.test.ts:**
```typescript
// Mock vscode module
jest.mock('vscode', () => ({
  workspace: {
    findFiles: jest.fn(),
    fs: { readFile: jest.fn() }
  },
  Uri: { file: (f: string) => ({ fsPath: f }) },
  RelativePattern: jest.fn()
}), { virtual: true });

import { WorkspaceScanner } from '../../../src/workspace/scanner';

describe('Workspace Scanner', () => {
  it('identifies SQL files', async () => {
    // Test file pattern matching
  });

  it('extracts table definitions from CREATE statements', async () => {
    // Test schema extraction
  });

  it('extracts table references from SELECT statements', async () => {
    // Test reference extraction
  });

  it('handles cancellation token', async () => {
    // Test cancellation
  });
});
```

### 1.5 Test Fixtures

**tests/fixtures/mysql/basic-select.sql:**
```sql
-- Simple SELECT
SELECT * FROM users;

-- SELECT with WHERE
SELECT id, name FROM users WHERE active = 1;

-- SELECT with JOIN
SELECT u.*, o.total
FROM users u
JOIN orders o ON u.id = o.user_id;
```

**tests/fixtures/edge-cases/parse-errors.sql:**
```sql
-- Valid query
SELECT * FROM users;

-- Invalid query (should fail gracefully)
SELEC * FORM users;

-- Another valid query
SELECT * FROM orders;
```

### 1.6 CI Integration

**.github/workflows/test.yml:**
```yaml
name: Tests

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:ci
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Phase 2: Performance Optimization

### 2.1 Code Splitting (Priority: High)

**Current Problem:**
- `sqlParser.ts` is 141KB (3,400+ lines)
- `renderer.ts` is ~180KB
- Everything loads on startup

**Solution: Webpack Code Splitting**

**webpack.config.js updates:**
```javascript
const webviewConfig = {
  // ... existing config
  optimization: {
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      maxSize: 100000,
      cacheGroups: {
        parser: {
          test: /[\\/]parser[\\/]/,
          name: 'parser',
          priority: 20,
          reuseExistingChunk: true,
        },
        lineage: {
          test: /[\\/]lineage[\\/]/,
          name: 'lineage',
          priority: 15,
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
          reuseExistingChunk: true,
        }
      }
    }
  }
};
```

**Dynamic Imports for Large Features:**
```typescript
// Lazy load dialect-specific parsers
async function getDialectParser(dialect: SqlDialect) {
  switch (dialect) {
    case 'Snowflake':
      return import('./dialects/snowflake');
    case 'BigQuery':
      return import('./dialects/bigquery');
    default:
      return import('./dialects/standard');
  }
}

// Lazy load workspace analysis
async function loadWorkspaceAnalyzer() {
  const { WorkspaceAnalyzer } = await import('./workspace/analyzer');
  return new WorkspaceAnalyzer();
}
```

### 2.2 Graph Virtualization (Priority: High)

**Current Problem:**
- Renders all nodes at once
- Slow with 500+ nodes
- Memory issues with large workspaces

**Solution: Viewport-Based Rendering**

**src/webview/renderer/virtualization.ts:**
```typescript
interface VirtualizationConfig {
  viewportPadding: number;      // Extra nodes to render outside viewport
  clusterThreshold: number;     // Cluster nodes when count exceeds this
  batchSize: number;            // Nodes to render per frame
}

interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class VirtualizedRenderer {
  private config: VirtualizationConfig = {
    viewportPadding: 200,
    clusterThreshold: 100,
    batchSize: 50
  };

  private allNodes: FlowNode[] = [];
  private visibleNodeIds: Set<string> = new Set();
  private nodePositions: Map<string, { x: number; y: number }> = new Map();

  /**
   * Update visible nodes based on current viewport
   */
  updateViewport(bounds: ViewportBounds): void {
    const padding = this.config.viewportPadding;
    const expandedBounds = {
      minX: bounds.minX - padding,
      maxX: bounds.maxX + padding,
      minY: bounds.minY - padding,
      maxY: bounds.maxY + padding
    };

    const newVisible = new Set<string>();

    for (const node of this.allNodes) {
      const pos = this.nodePositions.get(node.id);
      if (pos && this.isInBounds(pos, expandedBounds)) {
        newVisible.add(node.id);
      }
    }

    // Diff and update DOM
    const toAdd = [...newVisible].filter(id => !this.visibleNodeIds.has(id));
    const toRemove = [...this.visibleNodeIds].filter(id => !newVisible.has(id));

    this.removeNodes(toRemove);
    this.addNodes(toAdd);

    this.visibleNodeIds = newVisible;
  }

  /**
   * Render nodes in batches to avoid blocking UI
   */
  private async addNodes(nodeIds: string[]): Promise<void> {
    const batchSize = this.config.batchSize;

    for (let i = 0; i < nodeIds.length; i += batchSize) {
      const batch = nodeIds.slice(i, i + batchSize);

      for (const id of batch) {
        const node = this.allNodes.find(n => n.id === id);
        if (node) {
          this.renderNode(node);
        }
      }

      // Yield to browser
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }

  private isInBounds(pos: { x: number; y: number }, bounds: ViewportBounds): boolean {
    return pos.x >= bounds.minX && pos.x <= bounds.maxX &&
           pos.y >= bounds.minY && pos.y <= bounds.maxY;
  }
}
```

### 2.3 Node Clustering (Priority: Medium)

**For graphs with 200+ nodes:**

```typescript
interface Cluster {
  id: string;
  nodes: FlowNode[];
  centroid: { x: number; y: number };
  expanded: boolean;
}

export class NodeClusterer {
  private clusters: Cluster[] = [];

  /**
   * Group nearby nodes into clusters
   */
  clusterNodes(nodes: FlowNode[], threshold: number): Cluster[] {
    if (nodes.length < threshold) {
      return []; // No clustering needed
    }

    // Group by table/schema
    const bySchema = this.groupBySchema(nodes);

    // Create clusters
    return Object.entries(bySchema).map(([schema, schemaNodes]) => ({
      id: `cluster-${schema}`,
      nodes: schemaNodes,
      centroid: this.calculateCentroid(schemaNodes),
      expanded: false
    }));
  }

  /**
   * Render cluster as single expandable node
   */
  renderCluster(cluster: Cluster): SVGGElement {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-cluster-id', cluster.id);

    // Cluster badge showing count
    const badge = this.createClusterBadge(cluster.nodes.length);
    group.appendChild(badge);

    // Double-click to expand
    group.addEventListener('dblclick', () => this.expandCluster(cluster));

    return group;
  }
}
```

### 2.4 Web Worker for Parsing (Priority: Medium)

**Move heavy parsing to background thread:**

**src/webview/workers/parserWorker.ts:**
```typescript
import { parseSqlBatch, SqlDialect, BatchParseResult } from '../sqlParser';

self.onmessage = (event: MessageEvent) => {
  const { sql, dialect, requestId } = event.data;

  try {
    const result = parseSqlBatch(sql, dialect);
    self.postMessage({ requestId, result, error: null });
  } catch (error) {
    self.postMessage({ requestId, result: null, error: String(error) });
  }
};
```

**src/webview/parserClient.ts:**
```typescript
export class ParserClient {
  private worker: Worker;
  private pending: Map<string, { resolve: Function; reject: Function }> = new Map();

  constructor() {
    this.worker = new Worker(new URL('./workers/parserWorker.ts', import.meta.url));
    this.worker.onmessage = this.handleMessage.bind(this);
  }

  async parse(sql: string, dialect: SqlDialect): Promise<BatchParseResult> {
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ sql, dialect, requestId });

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('Parse timeout'));
        }
      }, 30000);
    });
  }

  private handleMessage(event: MessageEvent): void {
    const { requestId, result, error } = event.data;
    const handler = this.pending.get(requestId);

    if (handler) {
      this.pending.delete(requestId);
      if (error) {
        handler.reject(new Error(error));
      } else {
        handler.resolve(result);
      }
    }
  }

  dispose(): void {
    this.worker.terminate();
  }
}
```

### 2.5 Lazy Loading for Workspace (Priority: Medium)

**Load graph data on demand:**

```typescript
interface LazyGraphConfig {
  initialDepth: number;      // How many levels to load initially
  expandOnClick: boolean;    // Load more on node click
  prefetchAdjacent: boolean; // Prefetch connected nodes
}

export class LazyGraphLoader {
  private loadedNodes: Set<string> = new Set();
  private config: LazyGraphConfig = {
    initialDepth: 2,
    expandOnClick: true,
    prefetchAdjacent: true
  };

  /**
   * Load initial graph with limited depth
   */
  async loadInitial(rootNodes: string[]): Promise<GraphData> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const rootId of rootNodes) {
      await this.loadNodeWithDepth(rootId, this.config.initialDepth, nodes, edges);
    }

    return { nodes, edges };
  }

  /**
   * Expand a node to show its connections
   */
  async expandNode(nodeId: string): Promise<GraphData> {
    if (!this.config.expandOnClick) return { nodes: [], edges: [] };

    const additionalNodes: GraphNode[] = [];
    const additionalEdges: GraphEdge[] = [];

    // Load immediate connections
    await this.loadNodeWithDepth(nodeId, 1, additionalNodes, additionalEdges);

    // Prefetch next level in background
    if (this.config.prefetchAdjacent) {
      this.prefetchConnections(nodeId);
    }

    return { nodes: additionalNodes, edges: additionalEdges };
  }
}
```

---

## Implementation Timeline

### Week 1: Testing Setup
- [ ] Install Jest and configure
- [ ] Create test directory structure
- [ ] Write parser unit tests (basic)
- [ ] Set up CI workflow

### Week 2: Parser Tests
- [ ] Complete parser unit tests
- [ ] Add dialect-specific tests
- [ ] Add error handling tests
- [ ] Create test fixtures

### Week 3: Lineage & Workspace Tests
- [ ] Column lineage tests
- [ ] Workspace scanner tests
- [ ] Index manager tests
- [ ] Integration tests

### Week 4: Performance - Code Splitting
- [ ] Configure webpack code splitting
- [ ] Implement dynamic imports
- [ ] Measure bundle size improvements
- [ ] Test lazy loading

### Week 5: Performance - Virtualization
- [ ] Implement viewport-based rendering
- [ ] Add node clustering
- [ ] Test with large graphs (500+ nodes)
- [ ] Optimize memory usage

### Week 6: Performance - Web Workers
- [ ] Move parser to web worker
- [ ] Implement parser client
- [ ] Test background parsing
- [ ] Measure UI responsiveness

---

## Success Metrics

### Testing
- [ ] 60%+ code coverage
- [ ] All dialects have basic tests
- [ ] Error cases documented and tested
- [ ] CI passes on all PRs

### Performance
- [ ] Initial load < 500ms (currently ~1s for large files)
- [ ] Smooth interaction with 1000+ node graphs
- [ ] Memory usage < 200MB for workspace analysis
- [ ] No UI blocking during parsing

---

## Files to Modify

### Testing
- `package.json` - Add test dependencies and scripts
- Create `jest.config.js`
- Create `tests/` directory structure
- Create `.github/workflows/test.yml`

### Performance
- `webpack.config.js` - Code splitting
- `src/webview/renderer.ts` - Virtualization
- `src/webview/sqlParser.ts` - Web worker support
- Create `src/webview/workers/parserWorker.ts`
- Create `src/webview/renderer/virtualization.ts`
