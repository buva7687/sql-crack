import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';
import { LineageView } from '../../../../src/workspace/ui/lineageView';
import { getWebviewStyles } from '../../../../src/workspace/ui/sharedStyles';
import { LineageGraph } from '../../../../src/workspace/lineage/types';

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
        expect(script).toContain('sortSelect?.addEventListener(\'change\', filterLineageTables);');
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
});
