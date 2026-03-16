import {
    findSimilarTableNames,
    resolveLineageNodeId,
    resolveRequestedLineageNodeId,
} from '../../../../src/workspace/handlers/lineageNodeResolution';
import type { LineageGraph } from '../../../../src/workspace/lineage';

function createGraph(): LineageGraph {
    return {
        nodes: new Map([
            ['table:orders', { id: 'table:orders', name: 'orders', type: 'table', metadata: {} }],
            ['view:customer_summary', { id: 'view:customer_summary', name: 'customer_summary', type: 'view', metadata: {} }],
            ['table:public.payments', { id: 'table:public.payments', name: 'public.payments', type: 'table', metadata: {} }],
        ]),
        edges: [],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

describe('lineageNodeResolution', () => {
    it('resolves a requested node id when it already exists', () => {
        const graph = createGraph();

        expect(resolveRequestedLineageNodeId(graph, 'table:orders')).toBe('table:orders');
    });

    it('falls back across table and view node type alternatives', () => {
        const graph = createGraph();

        expect(resolveLineageNodeId(graph, 'table:customer_summary', 'customer_summary', 'table')).toBe('view:customer_summary');
    });

    it('matches unqualified names against qualified lineage nodes', () => {
        const graph = createGraph();

        expect(resolveLineageNodeId(graph, 'table:payments', 'payments', 'table')).toBe('table:public.payments');
    });

    it('uses label and type metadata when the requested id is stale', () => {
        const graph = createGraph();

        expect(resolveRequestedLineageNodeId(graph, 'table_17', 'orders', 'table')).toBe('table:orders');
    });

    it('returns fuzzy suggestions for unresolved table names', () => {
        const graph = createGraph();

        expect(findSimilarTableNames(graph, 'order')).toContain('orders');
    });
});
