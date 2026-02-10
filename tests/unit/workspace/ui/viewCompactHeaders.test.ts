import { ImpactView } from '../../../../src/workspace/ui/impactView';
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

describe('workspace compact view headers', () => {
    it('renders compact, differentiated headers across lineage and impact views', () => {
        const graph = createGraph();
        const lineageHtml = new LineageView().generateLineageSearchView(graph);
        const impactHtml = new ImpactView().generateImpactForm(graph);

        expect(lineageHtml).toContain('class="view-container view-lineage"');
        expect(lineageHtml).toContain('class="view-compact-header"');
        expect(lineageHtml).toContain('class="view-inline-stats"');
        expect(lineageHtml).not.toContain('view-controls-header');

        expect(impactHtml).toContain('class="view-container view-impact"');
        expect(impactHtml).toContain('class="view-compact-header"');
        expect(impactHtml).toContain('class="view-inline-stats"');
        expect(impactHtml).not.toContain('view-controls-header');
    });

    it('defines compact header and per-view accent styles in shared css', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.view-compact-header');
        expect(css).toContain('.view-inline-stats');
        expect(css).toContain('.view-container.view-lineage');
        expect(css).toContain('.view-container.view-impact');
    });
});
