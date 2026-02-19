import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';
import { LineageView } from '../../../../src/workspace/ui/lineageView';
import { getWebviewStyles } from '../../../../src/workspace/ui/sharedStyles';
import { LineageGraph } from '../../../../src/workspace/lineage/types';
import { LineageGraphRenderer } from '../../../../src/workspace/ui/lineageGraphRenderer';

function createGraph(): LineageGraph {
    return {
        nodes: new Map([
            ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
            ['view:daily_orders', { id: 'view:daily_orders', type: 'view', name: 'daily_orders', metadata: {} }],
            ['cte:active_orders', { id: 'cte:active_orders', type: 'cte', name: 'active_orders', metadata: {} }],
        ]),
        edges: [
            {
                id: 'edge:orders-daily',
                sourceId: 'table:orders',
                targetId: 'view:daily_orders',
                type: 'direct',
                metadata: {},
            },
        ],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

function createGraphWithColumnNodes(): LineageGraph {
    return {
        nodes: new Map([
            ['table:source', { id: 'table:source', type: 'table', name: 'source', metadata: {} }],
            ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
            ['view:order_rollup', { id: 'view:order_rollup', type: 'view', name: 'order_rollup', metadata: {} }],
            ['cte:recent_orders', { id: 'cte:recent_orders', type: 'cte', name: 'recent_orders', metadata: {} }],
            ['column:source.id', { id: 'column:source.id', type: 'column', name: 'id', parentId: 'table:source', metadata: {} }],
            ['column:orders.id', { id: 'column:orders.id', type: 'column', name: 'id', parentId: 'table:orders', metadata: {} }],
            ['column:orders.amount', { id: 'column:orders.amount', type: 'column', name: 'amount', parentId: 'table:orders', metadata: {} }],
        ]),
        edges: [
            {
                id: 'edge:source-orders',
                sourceId: 'table:source',
                targetId: 'table:orders',
                type: 'direct',
                metadata: {},
            },
            {
                id: 'edge:orders-rollup',
                sourceId: 'table:orders',
                targetId: 'view:order_rollup',
                type: 'direct',
                metadata: {},
            },
            {
                id: 'edge:orders-recent',
                sourceId: 'table:orders',
                targetId: 'cte:recent_orders',
                type: 'direct',
                metadata: {},
            },
            {
                id: 'edge:column-upstream-noise',
                sourceId: 'column:source.id',
                targetId: 'table:orders',
                type: 'direct',
                metadata: {},
            },
            {
                id: 'edge:column-downstream-noise-1',
                sourceId: 'table:orders',
                targetId: 'column:orders.id',
                type: 'direct',
                metadata: {},
            },
            {
                id: 'edge:column-downstream-noise-2',
                sourceId: 'table:orders',
                targetId: 'column:orders.amount',
                type: 'direct',
                metadata: {},
            },
        ],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

function createDepthGraph(): LineageGraph {
    return {
        nodes: new Map([
            ['table:a', { id: 'table:a', type: 'table', name: 'a', metadata: {} }],
            ['table:b', { id: 'table:b', type: 'table', name: 'b', metadata: {} }],
            ['table:c', { id: 'table:c', type: 'table', name: 'c', metadata: {} }],
        ]),
        edges: [
            { id: 'edge:a-b', sourceId: 'table:a', targetId: 'table:b', type: 'direct', metadata: {} },
            { id: 'edge:b-c', sourceId: 'table:b', targetId: 'table:c', type: 'direct', metadata: {} },
        ],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

describe('LineageView curated start content', () => {
    it('renders Most Connected section with show-all control and hidden full grid by default', () => {
        const html = new LineageView().generateLineageSearchView(createGraph());

        expect(html).toContain('Most Connected');
        expect(html).toContain('id="lineage-popular-section"');
        expect(html).toContain('id="lineage-popular-grid"');
        expect(html).toContain('id="lineage-show-all-btn"');
        expect(html).toContain('Show all 3 tables');
        expect(html).toContain('id="lineage-tables-grid" style="display: none;"');
        expect(html).toContain('id="lineage-sort"');
        expect(html).toContain('option value="connected">Most Connected');
        expect(html).toContain('class="lineage-table-item connection-');
        expect(html).toContain('data-total="');
    });

    it('includes script support for show-all expansion and curated-item click handling', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('const showAllBtn = document.getElementById(\'lineage-show-all-btn\');');
        expect(script).toContain('const sortSelect = document.getElementById(\'lineage-sort\');');
        expect(script).toContain('function setLineageGridMode(expanded)');
        expect(script).toContain('const sortValue = sortSelect?.value || \'connected\';');
        expect(script).toContain('showAllTables = true;');
        expect(script).toContain('sortSelect?.addEventListener(\'change\', () => {');
        expect(script).toContain('persistLineageSearchState();');
        expect(script).toContain('scheduleLineageFilter(true);');
        expect(script).toContain('.lineage-table-item, .popular-item');
    });

    it('defines styles for curated lineage sections and show-all button', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.lineage-popular-grid');
        expect(css).toContain('.lineage-show-all-btn');
        expect(css).toContain('.view-sort-group');
        expect(css).toContain('.lineage-table-item.connection-high');
        expect(css).toContain('.popular-item.connection-high');
    });

    it('counts only table/view/cte nodes in Most Connected badges when column nodes are present', () => {
        const html = new LineageView().generateLineageSearchView(createGraphWithColumnNodes());
        const ordersCard = html.match(/<button class="popular-item[\s\S]*?data-node-id="table:orders"[\s\S]*?<\/button>/)?.[0];

        expect(ordersCard).toBeDefined();
        expect(ordersCard).toContain('title="1 upstream, 2 downstream"');
        expect(ordersCard).toContain('class="conn-up">↑1</span>');
        expect(ordersCard).toContain('class="conn-down">↓2</span>');
        expect(ordersCard).toContain('data-total="3"');
    });

    it('uses requested lineage depth when computing overview connection counts', () => {
        const shallowHtml = new LineageView().generateLineageSearchView(createDepthGraph(), { depth: 1 });
        const deepHtml = new LineageView().generateLineageSearchView(createDepthGraph(), { depth: 5 });

        const shallowCard = shallowHtml.match(/<button class="popular-item[\s\S]*?data-node-id="table:a"[\s\S]*?<\/button>/)?.[0] || '';
        const deepCard = deepHtml.match(/<button class="popular-item[\s\S]*?data-node-id="table:a"[\s\S]*?<\/button>/)?.[0] || '';

        expect(shallowCard).toContain('title="0 upstream, 1 downstream"');
        expect(deepCard).toContain('title="0 upstream, 2 downstream"');
    });

    it('shows no-relationships state when lineage render has nodes but no connecting edges', () => {
        const view = new LineageView();
        const html = view.generateLineageGraphView({
            nodes: new Map([
                ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
                ['view:orders_rollup', { id: 'view:orders_rollup', type: 'view', name: 'orders_rollup', metadata: {} }],
            ]),
            edges: [],
            columnEdges: [],
            getUpstream: () => [],
            getDownstream: () => [],
            getColumnLineage: () => [],
        }, 'table:orders');

        expect(html).toContain('lineage-no-relations');
        expect(html).toContain('has no upstream or downstream relationships');
        expect(html).not.toContain('id="lineage-graph-container"');
    });

    it('clamps minimap dimensions in graph payload and viewBox for pathological layout sizes', () => {
        const buildGraphSpy = jest.spyOn(LineageGraphRenderer.prototype, 'buildGraph').mockReturnValue({
            nodes: [
                { id: 'table:orders', name: 'orders', type: 'table', x: 0, y: 0, width: 200, height: 78, expanded: false, upstreamCount: 0, downstreamCount: 0, depth: 0, metadata: {} } as any,
                { id: 'view:orders_rollup', name: 'orders_rollup', type: 'view', x: 999500, y: 999500, width: 200, height: 78, expanded: false, upstreamCount: 1, downstreamCount: 0, depth: 1, metadata: {} } as any,
            ],
            edges: [
                { id: 'e1', source: 'table:orders', target: 'view:orders_rollup', type: 'direct', points: [] }
            ],
            centerNodeId: 'table:orders',
            width: 999999,
            height: 999999,
            stats: { upstreamCount: 0, downstreamCount: 1, totalNodes: 2 },
        } as any);
        const generateSvgSpy = jest.spyOn(LineageGraphRenderer.prototype, 'generateSVG').mockReturnValue('<svg class="lineage-graph-svg"></svg>');

        const html = new LineageView().generateLineageGraphView(createGraph(), 'table:orders');

        expect(html).toContain('viewBox="0 0 20000 20000"');
        expect(html).toContain('"width":20000');
        expect(html).toContain('"height":20000');

        buildGraphSpy.mockRestore();
        generateSvgSpy.mockRestore();
    });
});
