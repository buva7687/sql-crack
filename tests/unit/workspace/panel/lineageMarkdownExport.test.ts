import { FlowAnalyzer } from '../../../../src/workspace/lineage/flowAnalyzer';
import { LineageGraph, LineageNode } from '../../../../src/workspace/lineage/types';
import { buildLineageMarkdownExport } from '../../../../src/workspace/panel/lineageMarkdownExport';

function createGraph(): LineageGraph {
    const nodes = new Map<string, LineageNode>([
        ['table:orders', { id: 'table:orders', name: 'orders', type: 'table', metadata: {}, filePath: '/repo/orders.sql', lineNumber: 3 }],
        ['table:customers', { id: 'table:customers', name: 'customers', type: 'table', metadata: {}, filePath: '/repo/customers.sql', lineNumber: 2 }],
        ['view:order_summary', { id: 'view:order_summary', name: 'order_summary', type: 'view', metadata: {}, filePath: '/repo/summary.sql', lineNumber: 8 }],
    ]);

    return {
        nodes,
        edges: [
            { id: 'e1', sourceId: 'table:customers', targetId: 'table:orders', type: 'join', metadata: {} },
            { id: 'e2', sourceId: 'table:orders', targetId: 'view:order_summary', type: 'direct', metadata: {} },
        ],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

describe('workspace/panel/lineageMarkdownExport.ts', () => {
    it('builds markdown for the current lineage graph view', () => {
        const graph = createGraph();
        const flowAnalyzer = new FlowAnalyzer(graph);
        const node = graph.nodes.get('table:orders');

        const payload = buildLineageMarkdownExport({
            flowAnalyzer,
            node: node!,
            direction: 'both',
            depth: 5,
            scopeUri: '/repo',
            expandedNodeCount: 1,
        });

        expect(payload.context.view).toBe('lineage');
        expect(payload.context.lineage?.centerNodeName).toBe('orders');
        expect(payload.markdown).toContain('# Lineage Graph');
        expect(payload.markdown).toContain('Node: table `orders`');
        expect(payload.markdown).toContain('Scope: /repo');
        expect(payload.markdown).toContain('## Upstream');
        expect(payload.markdown).toContain('`customers` (table)');
        expect(payload.markdown).toContain('## Downstream');
        expect(payload.markdown).toContain('`order_summary` (view)');
    });
});
