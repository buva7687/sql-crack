import { TableExplorer } from '../../../../src/workspace/ui/tableExplorer';
import { FlowAnalyzer } from '../../../../src/workspace/lineage/flowAnalyzer';
import { LineageGraph } from '../../../../src/workspace/lineage/types';

function createGraph(): LineageGraph {
    return {
        nodes: new Map([
            ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', filePath: '/repo/orders.sql', metadata: {} }],
            ['column:orders.id', { id: 'column:orders.id', type: 'column', name: 'id', parentId: 'table:orders', metadata: {} }],
            ['view:daily_orders', { id: 'view:daily_orders', type: 'view', name: 'daily_orders', metadata: {} }],
        ]),
        edges: [],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

describe('TableExplorer connection count caching', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('caches per-graph connection counts and excludes column nodes from badges', () => {
        const upstreamSpy = jest.spyOn(FlowAnalyzer.prototype, 'getUpstream').mockReturnValue({
            nodes: [
                { id: 'view:daily_orders', type: 'view', name: 'daily_orders', metadata: {} } as any,
                { id: 'column:orders.id', type: 'column', name: 'id', metadata: {} } as any,
            ],
            edges: [],
            paths: [],
            depth: 1,
        });
        const downstreamSpy = jest.spyOn(FlowAnalyzer.prototype, 'getDownstream').mockReturnValue({
            nodes: [
                { id: 'cte:order_stats', type: 'cte', name: 'order_stats', metadata: {} } as any,
                { id: 'column:orders.id', type: 'column', name: 'id', metadata: {} } as any,
            ],
            edges: [],
            paths: [],
            depth: 1,
        });

        const explorer = new TableExplorer();
        const graph = createGraph();

        const firstHtml = explorer.generateTableList(graph);
        explorer.generateTableList(graph);

        expect(upstreamSpy).toHaveBeenCalledTimes(2); // table + view on first render only
        expect(downstreamSpy).toHaveBeenCalledTimes(2);
        expect(firstHtml).toContain('upstream" title="1 table');
        expect(firstHtml).toContain('downstream" title="1 table');
        expect(firstHtml).not.toContain('upstream" title="2 table');
    });
});
