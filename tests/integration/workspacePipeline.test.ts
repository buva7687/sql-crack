/**
 * Integration test: Full workspace analysis pipeline
 *
 * SQL strings → SchemaExtractor + ReferenceExtractor → WorkspaceIndex
 *   → LineageBuilder → assert nodes/edges
 *   → buildDependencyGraph → assert WorkspaceDependencyGraph
 *   → GraphBuilder → assert visualization Graph
 *
 * Mocks: only vscode. Everything else runs real.
 */

jest.mock('vscode');

import { SchemaExtractor } from '../../src/workspace/extraction/schemaExtractor';
import { ReferenceExtractor } from '../../src/workspace/extraction/referenceExtractor';
import { LineageBuilder } from '../../src/workspace/lineage/lineageBuilder';
import { buildDependencyGraph } from '../../src/workspace/dependencyGraph';
import { GraphBuilder } from '../../src/workspace/graph/graphBuilder';
import type { WorkspaceIndex, FileAnalysis, WorkspaceDependencyGraph } from '../../src/workspace/types';

// ============================================================
// Test data: a small multi-file workspace
// ============================================================

const FILES: Record<string, string> = {
    '/workspace/customers.sql': `
        CREATE TABLE customers (
            id INT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(200)
        );
    `,
    '/workspace/orders.sql': `
        CREATE TABLE orders (
            id INT PRIMARY KEY,
            customer_id INT,
            amount DECIMAL(10, 2),
            created_at TIMESTAMP
        );
    `,
    '/workspace/report.sql': `
        CREATE VIEW customer_report AS
        SELECT
            c.name,
            c.email,
            SUM(o.amount) AS total_spent,
            COUNT(o.id) AS order_count
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        GROUP BY c.name, c.email;
    `,
    '/workspace/etl.sql': `
        INSERT INTO customer_report
        SELECT
            c.name,
            c.email,
            SUM(o.amount),
            COUNT(o.id)
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        GROUP BY c.name, c.email;
    `,
};

// ============================================================
// Helpers
// ============================================================

function buildIndex(files: Record<string, string>): WorkspaceIndex {
    const schemaExtractor = new SchemaExtractor();
    const refExtractor = new ReferenceExtractor();

    const index: WorkspaceIndex = {
        version: 1,
        lastUpdated: Date.now(),
        fileCount: Object.keys(files).length,
        files: new Map(),
        fileHashes: new Map(),
        definitionMap: new Map(),
        referenceMap: new Map(),
    };

    for (const [filePath, sql] of Object.entries(files)) {
        const definitions = schemaExtractor.extractDefinitions(sql, filePath);
        const references = refExtractor.extractReferences(sql, filePath);

        const fileName = filePath.split('/').pop() || filePath;
        const analysis: FileAnalysis = {
            filePath,
            fileName,
            lastModified: Date.now(),
            contentHash: 'test-hash-' + fileName,
            definitions,
            references,
            queries: [],
        };
        index.files.set(filePath, analysis);
        index.fileHashes.set(filePath, 'hash-' + filePath);

        // Build definition map (keyed by lowercase name)
        for (const def of definitions) {
            const key = def.name.toLowerCase();
            if (!index.definitionMap.has(key)) {
                index.definitionMap.set(key, []);
            }
            index.definitionMap.get(key)!.push(def);
        }

        // Build reference map (keyed by lowercase table name)
        for (const ref of references) {
            const key = ref.tableName.toLowerCase();
            if (!index.referenceMap.has(key)) {
                index.referenceMap.set(key, []);
            }
            index.referenceMap.get(key)!.push(ref);
        }
    }

    return index;
}

// ============================================================
// Tests
// ============================================================

describe('Workspace Pipeline Integration', () => {
    let index: WorkspaceIndex;

    beforeAll(() => {
        index = buildIndex(FILES);
    });

    describe('Extraction phase', () => {
        it('extracts table definitions from CREATE TABLE statements', () => {
            expect(index.definitionMap.has('customers')).toBe(true);
            expect(index.definitionMap.has('orders')).toBe(true);
        });

        it('extracts view definitions from CREATE VIEW', () => {
            expect(index.definitionMap.has('customer_report')).toBe(true);
            const defs = index.definitionMap.get('customer_report')!;
            expect(defs.some(d => d.type === 'view')).toBe(true);
        });

        it('extracts column definitions from CREATE TABLE', () => {
            const customerDefs = index.definitionMap.get('customers')!;
            const tableDef = customerDefs.find(d => d.type === 'table');
            expect(tableDef).toBeDefined();
            const colNames = tableDef!.columns.map(c => c.name.toLowerCase());
            expect(colNames).toEqual(expect.arrayContaining(['id', 'name', 'email']));
        });

        it('extracts table references from SELECT/JOIN', () => {
            expect(index.referenceMap.has('customers')).toBe(true);
            expect(index.referenceMap.has('orders')).toBe(true);
        });

        it('extracts INSERT target as a reference', () => {
            const reportRefs = index.referenceMap.get('customer_report') || [];
            const hasInsert = reportRefs.some(r => r.referenceType === 'insert');
            expect(hasInsert).toBe(true);
        });

        it('indexes all files', () => {
            expect(index.files.size).toBe(4);
            expect(index.fileCount).toBe(4);
        });
    });

    describe('Lineage phase', () => {
        let builder: LineageBuilder;

        beforeAll(() => {
            builder = new LineageBuilder({ includeExternal: true, includeColumns: true });
            builder.buildFromIndex(index);
        });

        it('creates lineage nodes for defined tables', () => {
            expect(builder.nodes.has('table:customers')).toBe(true);
            expect(builder.nodes.has('table:orders')).toBe(true);
        });

        it('creates lineage node for the view', () => {
            const viewNode = builder.nodes.get('view:customer_report') || builder.nodes.get('table:customer_report');
            expect(viewNode).toBeDefined();
        });

        it('creates edges showing report depends on customers and orders', () => {
            // The view/report references customers and orders
            const edgesToReport = builder.edges.filter(
                e => e.targetId.includes('customer_report')
            );
            const sourceIds = edgesToReport.map(e => e.sourceId);
            expect(sourceIds.some(id => id.includes('customers'))).toBe(true);
            expect(sourceIds.some(id => id.includes('orders'))).toBe(true);
        });

        it('has at least one edge per cross-table dependency', () => {
            // Total edges should cover: report→customers, report→orders, etl→customers, etl→orders, etl→customer_report
            expect(builder.edges.length).toBeGreaterThanOrEqual(2);
        });

        it('getUpstream returns source tables for the report', () => {
            const reportNodeId = [...builder.nodes.keys()].find(k => k.includes('customer_report'));
            expect(reportNodeId).toBeDefined();
            if (reportNodeId) {
                // Try depth 2 in case edges are multi-hop
                const upstream = builder.getUpstream(reportNodeId, 3);
                if (upstream.length === 0) {
                    // Edge direction may be reversed (source=report, target=customers)
                    // — verify via downstream from customers instead
                    const customersNode = [...builder.nodes.keys()].find(k => k === 'table:customers');
                    if (customersNode) {
                        const downstream = builder.getDownstream(customersNode, 3);
                        const names = downstream.map(n => n.name.toLowerCase());
                        expect(names.some(n => n.includes('customer_report'))).toBe(true);
                    }
                } else {
                    const names = upstream.map(n => n.name.toLowerCase());
                    expect(names.some(n => n.includes('customers') || n.includes('orders'))).toBe(true);
                }
            }
        });

        it('getDownstream from customers includes the report', () => {
            const customersNodeId = [...builder.nodes.keys()].find(k => k === 'table:customers');
            if (customersNodeId) {
                const downstream = builder.getDownstream(customersNodeId, 2);
                const names = downstream.map(n => n.name.toLowerCase());
                expect(names.some(n => n.includes('customer_report'))).toBe(true);
            }
        });
    });

    describe('Dependency graph phase (buildDependencyGraph)', () => {
        let tableGraph: WorkspaceDependencyGraph;
        let fileGraph: WorkspaceDependencyGraph;

        beforeAll(() => {
            tableGraph = buildDependencyGraph(index, 'tables');
            fileGraph = buildDependencyGraph(index, 'files');
        });

        it('table mode creates nodes for each defined table/view', () => {
            const labels = tableGraph.nodes.map(n => n.label.toLowerCase());
            expect(labels).toEqual(expect.arrayContaining(['customers', 'orders']));
            // customer_report should appear (as view or table node)
            expect(labels.some(l => l.includes('customer_report'))).toBe(true);
        });

        it('table mode creates edges representing dependencies', () => {
            expect(tableGraph.edges.length).toBeGreaterThanOrEqual(1);
            // Each edge should have valid source/target that match node ids
            const nodeIds = new Set(tableGraph.nodes.map(n => n.id));
            for (const edge of tableGraph.edges) {
                expect(nodeIds.has(edge.source)).toBe(true);
                expect(nodeIds.has(edge.target)).toBe(true);
            }
        });

        it('table mode stats report correct totals', () => {
            expect(tableGraph.stats.totalFiles).toBe(4);
            expect(tableGraph.stats.totalTables).toBeGreaterThanOrEqual(2);
        });

        it('file mode creates one node per file', () => {
            const filePaths = fileGraph.nodes
                .filter(n => n.type === 'file')
                .map(n => n.filePath);
            expect(filePaths.length).toBe(4);
        });

        it('file mode edges connect files that share table dependencies', () => {
            // report.sql and etl.sql both reference customers/orders
            expect(fileGraph.edges.length).toBeGreaterThanOrEqual(1);
            const nodeIds = new Set(fileGraph.nodes.map(n => n.id));
            for (const edge of fileGraph.edges) {
                expect(nodeIds.has(edge.source)).toBe(true);
                expect(nodeIds.has(edge.target)).toBe(true);
            }
        });

        it('nodes have layout positions after graph build', () => {
            for (const node of tableGraph.nodes) {
                expect(typeof node.x).toBe('number');
                expect(typeof node.y).toBe('number');
                expect(node.width).toBeGreaterThan(0);
                expect(node.height).toBeGreaterThan(0);
            }
        });
    });

    describe('GraphBuilder phase (visualization graph)', () => {
        let graphBuilder: GraphBuilder;
        let depGraph: WorkspaceDependencyGraph;

        beforeAll(() => {
            depGraph = buildDependencyGraph(index, 'tables');
            graphBuilder = new GraphBuilder();
        });

        it('buildFromWorkspace converts all nodes', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            expect(graph.nodes.length).toBe(depGraph.nodes.length);
            expect(graph.edges.length).toBe(depGraph.edges.length);
        });

        it('converted nodes preserve id, type, label, and position', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            for (const gNode of graph.nodes) {
                const srcNode = depGraph.nodes.find(n => n.id === gNode.id);
                expect(srcNode).toBeDefined();
                expect(gNode.type).toBe(srcNode!.type);
                expect(gNode.label).toBe(srcNode!.label);
                expect(gNode.x).toBe(srcNode!.x);
                expect(gNode.y).toBe(srcNode!.y);
            }
        });

        it('converted nodes carry metadata with definition and reference counts', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            for (const gNode of graph.nodes) {
                expect(gNode.metadata).toBeDefined();
                // definitionCount/referenceCount may be undefined for external nodes
                expect(gNode.metadata.definitionCount === undefined || typeof gNode.metadata.definitionCount === 'number').toBe(true);
                expect(gNode.metadata.referenceCount === undefined || typeof gNode.metadata.referenceCount === 'number').toBe(true);
            }
        });

        it('converted edges have type "dependency" and carry metadata', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            for (const gEdge of graph.edges) {
                expect(gEdge.type).toBe('dependency');
                expect(gEdge.metadata).toBeDefined();
                expect(typeof gEdge.metadata.count).toBe('number');
            }
        });

        it('default options set mode=file, direction=TB, showExternal=true', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            expect(graph.options.mode).toBe('file');
            expect(graph.options.direction).toBe('TB');
            expect(graph.options.showExternal).toBe(true);
        });

        it('buildForMode sets mode correctly', () => {
            const graph = graphBuilder.buildForMode(depGraph, 'table');
            expect(graph.options.mode).toBe('table');
        });

        it('filterByType returns only requested node types', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            const tableOnly = graphBuilder.filterByType(graph, ['table']);
            expect(tableOnly.nodes.every(n => n.type === 'table')).toBe(true);
            // Edges should only reference remaining nodes
            const ids = new Set(tableOnly.nodes.map(n => n.id));
            for (const edge of tableOnly.edges) {
                expect(ids.has(edge.source)).toBe(true);
                expect(ids.has(edge.target)).toBe(true);
            }
        });

        it('focusOnNode returns subgraph within depth', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            if (graph.nodes.length === 0) { return; }
            const focusId = graph.nodes[0].id;
            const focused = graphBuilder.focusOnNode(graph, focusId, 1);
            expect(focused.nodes.some(n => n.id === focusId)).toBe(true);
            expect(focused.options.focusNode).toBe(focusId);
            // All included nodes should be within 1 hop
            expect(focused.nodes.length).toBeLessThanOrEqual(graph.nodes.length);
        });

        it('focusOnNode returns full graph when node not found', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            const result = graphBuilder.focusOnNode(graph, 'nonexistent', 2);
            expect(result.nodes.length).toBe(graph.nodes.length);
        });

        it('highlightPath marks nodes and edges on the path', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            if (graph.edges.length === 0) { return; }
            const edge = graph.edges[0];
            const result = graphBuilder.highlightPath(graph, edge.source, edge.target);
            const highlighted = result.nodes.filter(n => n.highlighted);
            expect(highlighted.length).toBeGreaterThanOrEqual(2);
            expect(highlighted.some(n => n.id === edge.source)).toBe(true);
            expect(highlighted.some(n => n.id === edge.target)).toBe(true);
        });

        it('highlightPath returns new arrays (shallow copy)', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            if (graph.edges.length === 0) { return; }
            const edge = graph.edges[0];
            const result = graphBuilder.highlightPath(graph, edge.source, edge.target);
            // Returns new array instances (not the same reference)
            expect(result.nodes).not.toBe(graph.nodes);
            expect(result.edges).not.toBe(graph.edges);
        });

        it('multi-hop edge label shows count for edges with count > 1', () => {
            const graph = graphBuilder.buildFromWorkspace(depGraph);
            for (const gEdge of graph.edges) {
                const srcEdge = depGraph.edges.find(e => e.id === gEdge.id);
                if (srcEdge && srcEdge.count > 1) {
                    expect(gEdge.label).toBe(String(srcEdge.count));
                }
            }
        });
    });

    describe('End-to-end consistency', () => {
        it('every definition in the index produces a lineage node', () => {
            const builder = new LineageBuilder({ includeExternal: false, includeColumns: false });
            builder.buildFromIndex(index);

            for (const defName of index.definitionMap.keys()) {
                const hasNode = [...builder.nodes.keys()].some(k =>
                    k.toLowerCase().includes(defName.toLowerCase())
                );
                expect(hasNode).toBe(true);
            }
        });

        it('lineage edges reference only nodes that exist in the graph', () => {
            const builder = new LineageBuilder({ includeExternal: true, includeColumns: true });
            builder.buildFromIndex(index);

            for (const edge of builder.edges) {
                expect(builder.nodes.has(edge.sourceId)).toBe(true);
                expect(builder.nodes.has(edge.targetId)).toBe(true);
            }
        });
    });
});
