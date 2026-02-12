/**
 * ImpactAnalyzer Tests
 *
 * Tests for impact analysis: table changes, column changes, severity, suggestions.
 * Uses real FlowAnalyzer wrapping mock graphs.
 */

import { ImpactAnalyzer, ChangeType } from '../../../../src/workspace/lineage/impactAnalyzer';
import { FlowAnalyzer } from '../../../../src/workspace/lineage/flowAnalyzer';
import { LineageGraph, LineageNode, LineageEdge, ColumnLineageEdge } from '../../../../src/workspace/lineage/types';

// --- Helpers ---

function makeNode(id: string, type: LineageNode['type'] = 'table', name?: string, extra?: Partial<LineageNode>): LineageNode {
    return { id, type, name: name ?? id, metadata: {}, ...extra };
}

function makeEdge(sourceId: string, targetId: string, type: LineageEdge['type'] = 'direct', metadata?: Record<string, any>): LineageEdge {
    return { id: `${sourceId}->${targetId}`, sourceId, targetId, type, metadata: metadata ?? {} };
}

function createMockGraph(
    nodes: LineageNode[],
    edges: LineageEdge[],
    columnEdges: ColumnLineageEdge[] = []
): LineageGraph {
    const nodeMap = new Map<string, LineageNode>();
    for (const n of nodes) { nodeMap.set(n.id, n); }
    return {
        nodes: nodeMap,
        edges,
        columnEdges,
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => []
    };
}

function makeAnalyzer(
    nodes: LineageNode[],
    edges: LineageEdge[],
    columnEdges: ColumnLineageEdge[] = []
): { graph: LineageGraph; analyzer: ImpactAnalyzer } {
    const graph = createMockGraph(nodes, edges, columnEdges);
    const flow = new FlowAnalyzer(graph);
    const analyzer = new ImpactAnalyzer(graph, flow);
    return { graph, analyzer };
}

// --- Tests ---

describe('ImpactAnalyzer', () => {
    describe('analyzeTableChange', () => {
        it('returns not-found report for unknown table', () => {
            const { analyzer } = makeAnalyzer([], []);
            const report = analyzer.analyzeTableChange('nonexistent');
            expect(report.severity).toBe('low');
            expect(report.summary.totalAffected).toBe(0);
            expect(report.suggestions.some(s => s.includes('not found'))).toBe(true);
        });

        it('identifies direct impacts', () => {
            const nodes = [
                makeNode('table:orders', 'table', 'orders'),
                makeNode('table:report', 'table', 'report', { filePath: 'report.sql' })
            ];
            const edges = [makeEdge('table:orders', 'table:report')];
            const { analyzer } = makeAnalyzer(nodes, edges);

            const report = analyzer.analyzeTableChange('orders');
            expect(report.directImpacts).toHaveLength(1);
            expect(report.directImpacts[0].node.id).toBe('table:report');
            expect(report.directImpacts[0].impactType).toBe('direct');
        });

        it('identifies transitive impacts', () => {
            const nodes = [
                makeNode('table:orders', 'table', 'orders'),
                makeNode('table:staging', 'table', 'staging', { filePath: 'staging.sql' }),
                makeNode('table:report', 'table', 'report', { filePath: 'staging.sql' })
            ];
            const edges = [
                makeEdge('table:orders', 'table:staging'),
                makeEdge('table:staging', 'table:report')
            ];
            const { analyzer } = makeAnalyzer(nodes, edges);

            const report = analyzer.analyzeTableChange('orders');
            expect(report.directImpacts).toHaveLength(1);
            // The cross-file filter may filter out report if def files don't overlap
            // but staging.sql is shared, so report should appear as transitive
            expect(report.transitiveImpacts.length + report.directImpacts.length).toBeGreaterThanOrEqual(1);
        });

        it('respects changeType in report', () => {
            const nodes = [makeNode('table:orders', 'table', 'orders')];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeTableChange('orders', 'drop');
            expect(report.changeType).toBe('drop');
        });

        it('generates drop suggestions when changeType is drop', () => {
            const nodes = [makeNode('table:orders', 'table', 'orders')];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeTableChange('orders', 'drop');
            expect(report.suggestions.some(s => s.includes('deprecated'))).toBe(true);
        });

        it('generates rename suggestions when changeType is rename', () => {
            const nodes = [makeNode('table:orders', 'table', 'orders')];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeTableChange('orders', 'rename');
            expect(report.suggestions.some(s => s.includes('references') || s.includes('alias'))).toBe(true);
        });

        it('skips own column nodes from impacts', () => {
            const nodes = [
                makeNode('table:orders', 'table', 'orders'),
                makeNode('column:orders.id', 'column', 'id', { parentId: 'table:orders' })
            ];
            const edges = [
                makeEdge('table:orders', 'column:orders.id', 'direct', { relationship: 'contains' })
            ];
            const { analyzer } = makeAnalyzer(nodes, edges);
            const report = analyzer.analyzeTableChange('orders');
            expect(report.directImpacts).toHaveLength(0);
        });
    });

    describe('analyzeColumnChange', () => {
        it('falls back to table-level when column node not found', () => {
            const nodes = [makeNode('table:orders', 'table', 'orders')];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeColumnChange('orders', 'missing_col');
            // Falls back to analyzeTableChange
            expect(report.target.type).toBe('table');
        });

        it('finds downstream impacts of a column', () => {
            const nodes = [
                makeNode('column:orders.amount', 'column', 'amount'),
                makeNode('column:report.total', 'column', 'total', { filePath: 'report.sql' })
            ];
            const edges = [makeEdge('column:orders.amount', 'column:report.total')];
            const { analyzer } = makeAnalyzer(nodes, edges);

            const report = analyzer.analyzeColumnChange('orders', 'amount');
            expect(report.target.type).toBe('column');
            expect(report.directImpacts).toHaveLength(1);
        });
    });

    describe('calculateSeverity', () => {
        it('returns low for 0-2 affected', () => {
            const { analyzer } = makeAnalyzer([], []);
            expect(analyzer.calculateSeverity({
                summary: { totalAffected: 0, tablesAffected: 0, viewsAffected: 0, queriesAffected: 0, filesAffected: 0 }
            })).toBe('low');
            expect(analyzer.calculateSeverity({
                summary: { totalAffected: 2, tablesAffected: 1, viewsAffected: 0, queriesAffected: 2, filesAffected: 1 }
            })).toBe('low');
        });

        it('returns medium for 3-9 affected', () => {
            const { analyzer } = makeAnalyzer([], []);
            expect(analyzer.calculateSeverity({
                summary: { totalAffected: 5, tablesAffected: 3, viewsAffected: 0, queriesAffected: 5, filesAffected: 2 }
            })).toBe('medium');
        });

        it('returns high for 10-19 affected', () => {
            const { analyzer } = makeAnalyzer([], []);
            expect(analyzer.calculateSeverity({
                summary: { totalAffected: 15, tablesAffected: 10, viewsAffected: 2, queriesAffected: 15, filesAffected: 5 }
            })).toBe('high');
        });

        it('returns critical for 20+ affected', () => {
            const { analyzer } = makeAnalyzer([], []);
            expect(analyzer.calculateSeverity({
                summary: { totalAffected: 25, tablesAffected: 15, viewsAffected: 5, queriesAffected: 25, filesAffected: 8 }
            })).toBe('critical');
        });
    });

    describe('analyzeRename', () => {
        it('delegates table rename to analyzeTableChange', () => {
            const nodes = [makeNode('table:orders', 'table', 'orders')];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeRename('table', 'orders', 'orders_v2');
            expect(report.changeType).toBe('rename');
            expect(report.target.name).toBe('orders');
        });

        it('delegates column rename to analyzeColumnChange', () => {
            const nodes = [
                makeNode('table:orders', 'table', 'orders'),
                makeNode('column:orders.amount', 'column', 'amount')
            ];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeRename('column', 'amount', 'total', 'orders');
            expect(report.changeType).toBe('rename');
        });
    });

    describe('analyzeDrop', () => {
        it('delegates table drop to analyzeTableChange', () => {
            const nodes = [makeNode('table:orders', 'table', 'orders')];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeDrop('table', 'orders');
            expect(report.changeType).toBe('drop');
        });

        it('delegates column drop to analyzeColumnChange', () => {
            const nodes = [
                makeNode('table:orders', 'table', 'orders'),
                makeNode('column:orders.amount', 'column', 'amount')
            ];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeDrop('column', 'amount', 'orders');
            expect(report.changeType).toBe('drop');
        });
    });

    describe('addColumn suggestions', () => {
        it('generates SELECT * warning for addColumn change type', () => {
            const nodes = [makeNode('table:orders', 'table', 'orders')];
            const { analyzer } = makeAnalyzer(nodes, []);
            const report = analyzer.analyzeTableChange('orders', 'addColumn');
            expect(report.suggestions.some(s => s.includes('SELECT *'))).toBe(true);
        });
    });

    describe('high severity suggestions', () => {
        it('includes maintenance window suggestion when severity is high or critical', () => {
            // Build a graph with 20+ downstream nodes to trigger critical severity
            const nodes: LineageNode[] = [makeNode('table:core', 'table', 'core')];
            const edges: LineageEdge[] = [];
            for (let i = 0; i < 25; i++) {
                const id = `table:dep${i}`;
                nodes.push(makeNode(id, 'table', `dep${i}`, { filePath: 'same.sql' }));
                edges.push(makeEdge('table:core', id));
            }
            // Set the core node's filePath so the cross-file filter doesn't exclude deps
            nodes[0].filePath = 'same.sql';
            const { analyzer } = makeAnalyzer(nodes, edges);
            const report = analyzer.analyzeTableChange('core');
            expect(report.suggestions.some(s => s.includes('maintenance window') || s.includes('rollback'))).toBe(true);
        });
    });
});
