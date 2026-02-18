/**
 * ColumnLineageTracker Tests
 *
 * Tests for column-level lineage tracing: upstream, downstream, full lineage, paths, transform mapping.
 */

import { ColumnLineageTracker } from '../../../../src/workspace/lineage/columnLineage';
import { LineageGraph, LineageNode, LineageEdge, ColumnLineageEdge, LineagePath } from '../../../../src/workspace/lineage/types';

// --- Helpers ---

function makeNode(id: string, type: LineageNode['type'] = 'table', name?: string): LineageNode {
    return { id, type, name: name ?? id, metadata: {} };
}

function makeEdge(sourceId: string, targetId: string, type: LineageEdge['type'] = 'direct'): LineageEdge {
    return { id: `${sourceId}->${targetId}`, sourceId, targetId, type, metadata: {} };
}

function makeColumnEdge(
    sourceTableId: string, sourceColumnName: string,
    targetTableId: string, targetColumnName: string,
    transformationType: ColumnLineageEdge['transformationType'] = 'direct',
    extra?: Partial<ColumnLineageEdge>
): ColumnLineageEdge {
    return {
        id: `${sourceTableId}.${sourceColumnName}->${targetTableId}.${targetColumnName}`,
        sourceTableId,
        sourceColumnName,
        targetTableId,
        targetColumnName,
        transformationType,
        filePath: 'test.sql',
        lineNumber: 1,
        ...extra
    };
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

// --- Tests ---

describe('ColumnLineageTracker', () => {
    const srcTable = makeNode('table:orders', 'table', 'orders');
    const tgtTable = makeNode('table:order_summary', 'table', 'order_summary');

    describe('traceColumnUpstream', () => {
        it('finds column-level upstream edges by exact table ID match', () => {
            const colEdge = makeColumnEdge('table:orders', 'amount', 'table:order_summary', 'total_amount');
            const graph = createMockGraph([srcTable, tgtTable], [], [colEdge]);
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnUpstream(graph, 'table:order_summary', 'total_amount');
            expect(paths).toHaveLength(1);
            expect(paths[0].nodes[0].id).toBe('table:orders');
        });

        it('matches case-insensitively on column name', () => {
            const colEdge = makeColumnEdge('table:orders', 'Amount', 'table:order_summary', 'TOTAL_AMOUNT');
            const graph = createMockGraph([srcTable, tgtTable], [], [colEdge]);
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnUpstream(graph, 'table:order_summary', 'total_amount');
            expect(paths).toHaveLength(1);
        });

        it('falls back to table-level when no column edges exist', () => {
            const tableEdge = makeEdge('table:orders', 'table:order_summary');
            const graph = createMockGraph([srcTable, tgtTable], [tableEdge], []);
            // Mock getUpstream to return the source table for fallback
            graph.getUpstream = (id: string) => id === 'table:order_summary' ? [srcTable] : [];
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnUpstream(graph, 'table:order_summary', 'total_amount');
            expect(paths).toHaveLength(1);
            expect(paths[0].nodes[0].id).toBe('table:order_summary');
        });

        it('matches table ID by suffix (type:name pattern)', () => {
            const colEdge = makeColumnEdge('table:orders', 'id', 'view:order_summary', 'order_id');
            const viewNode = makeNode('view:order_summary', 'view', 'order_summary');
            const graph = createMockGraph([srcTable, viewNode], [], [colEdge]);
            const tracker = new ColumnLineageTracker(graph);

            // Uses endsWith(`:${getTableName(tableId)}`)
            const paths = tracker.traceColumnUpstream(graph, 'view:order_summary', 'order_id');
            expect(paths).toHaveLength(1);
        });

        it('groups multiple upstream edges by source table', () => {
            const colEdges = [
                makeColumnEdge('table:orders', 'amount', 'table:order_summary', 'total'),
                makeColumnEdge('table:orders', 'qty', 'table:order_summary', 'total')
            ];
            const graph = createMockGraph([srcTable, tgtTable], [], colEdges);
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnUpstream(graph, 'table:order_summary', 'total');
            // Both edges grouped into one path per source table
            expect(paths).toHaveLength(1);
            expect(paths[0].edges).toHaveLength(2);
        });
    });

    describe('traceColumnDownstream', () => {
        it('finds column-level downstream edges', () => {
            const colEdge = makeColumnEdge('table:orders', 'amount', 'table:order_summary', 'total_amount');
            const graph = createMockGraph([srcTable, tgtTable], [], [colEdge]);
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnDownstream(graph, 'table:orders', 'amount');
            expect(paths).toHaveLength(1);
            expect(paths[0].nodes.some(n => n.id === 'table:order_summary')).toBe(true);
        });

        it('falls back to table-level when no column edges exist', () => {
            const tableEdge = makeEdge('table:orders', 'table:order_summary');
            const graph = createMockGraph([srcTable, tgtTable], [tableEdge], []);
            graph.getDownstream = (id: string) => id === 'table:orders' ? [tgtTable] : [];
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnDownstream(graph, 'table:orders', 'amount');
            expect(paths).toHaveLength(1);
        });

        it('returns empty when no edges and no table-level downstream', () => {
            const graph = createMockGraph([srcTable], [], []);
            graph.getDownstream = () => [];
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnDownstream(graph, 'table:orders', 'amount');
            expect(paths).toHaveLength(0);
        });
    });

    describe('getFullColumnLineage', () => {
        it('returns both upstream and downstream', () => {
            const colEdgeUp = makeColumnEdge('table:raw', 'val', 'table:orders', 'amount');
            const colEdgeDown = makeColumnEdge('table:orders', 'amount', 'table:order_summary', 'total');
            const rawNode = makeNode('table:raw', 'table', 'raw');
            const graph = createMockGraph(
                [rawNode, srcTable, tgtTable], [],
                [colEdgeUp, colEdgeDown]
            );
            const tracker = new ColumnLineageTracker(graph);

            const result = tracker.getFullColumnLineage(graph, 'table:orders', 'amount');
            expect(result.upstream).toHaveLength(1);
            expect(result.downstream).toHaveLength(1);
        });
    });

    describe('getColumnLineagePaths', () => {
        it('returns structured upstream and downstream paths', () => {
            const colEdge = makeColumnEdge('table:orders', 'amount', 'table:order_summary', 'total', 'aggregate', {
                expression: 'SUM(amount)',
                filePath: 'agg.sql',
                lineNumber: 10
            });
            const graph = createMockGraph([srcTable, tgtTable], [], [colEdge]);
            const tracker = new ColumnLineageTracker(graph);

            const result = tracker.getColumnLineagePaths(graph, 'table:order_summary', 'total');
            expect(result.upstream).toHaveLength(1);
            expect(result.upstream[0].sourceColumnName).toBe('amount');
            expect(result.upstream[0].transformationType).toBe('aggregate');
            expect(result.upstream[0].expression).toBe('SUM(amount)');

            const downResult = tracker.getColumnLineagePaths(graph, 'table:orders', 'amount');
            expect(downResult.downstream).toHaveLength(1);
            expect(downResult.downstream[0].targetColumnName).toBe('total');
        });

        it('returns empty arrays for no matches', () => {
            const graph = createMockGraph([srcTable], [], []);
            const tracker = new ColumnLineageTracker(graph);
            const result = tracker.getColumnLineagePaths(graph, 'table:orders', 'nonexistent');
            expect(result.upstream).toHaveLength(0);
            expect(result.downstream).toHaveLength(0);
        });

        it('does not treat malformed table IDs as valid suffix matches', () => {
            const colEdge = makeColumnEdge('table:orders', 'amount', 'table:order_summary', 'total');
            const graph = createMockGraph([srcTable, tgtTable], [], [colEdge]);
            const tracker = new ColumnLineageTracker(graph);

            const result = tracker.getColumnLineagePaths(graph, 'bad:order_summary', 'total');
            expect(result.upstream).toHaveLength(0);
            expect(result.downstream).toHaveLength(0);
        });
    });

    describe('mapTransformToEdgeType (via traceColumnUpstream edge types)', () => {
        const cases: Array<[ColumnLineageEdge['transformationType'], string]> = [
            ['direct', 'direct'],
            ['rename', 'direct'],
            ['aggregate', 'aggregate'],
            ['join', 'join'],
            ['filter', 'filter'],
            ['expression', 'transform'],
            ['case', 'transform'],
            ['cast', 'transform'],
            ['coalesce', 'transform'],
            ['unknown', 'transform']
        ];

        it.each(cases)('maps %s → %s', (transformType, expectedEdgeType) => {
            const colEdge = makeColumnEdge('table:orders', 'col', 'table:order_summary', 'col', transformType);
            const graph = createMockGraph([srcTable, tgtTable], [], [colEdge]);
            const tracker = new ColumnLineageTracker(graph);

            const paths = tracker.traceColumnUpstream(graph, 'table:order_summary', 'col');
            expect(paths).toHaveLength(1);
            expect(paths[0].edges[0].type).toBe(expectedEdgeType);
        });
    });
});
