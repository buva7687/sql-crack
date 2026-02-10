import { ImpactReport } from '../../../../src/workspace/lineage/impactAnalyzer';
import { LineageGraph } from '../../../../src/workspace/lineage/types';
import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';
import { ImpactView } from '../../../../src/workspace/ui/impactView';
import { LineageView } from '../../../../src/workspace/ui/lineageView';
import { getWebviewStyles } from '../../../../src/workspace/ui/sharedStyles';
import { TableExplorer } from '../../../../src/workspace/ui/tableExplorer';

function createGraph(): LineageGraph {
    return {
        nodes: new Map([
            ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
            ['view:daily_orders', { id: 'view:daily_orders', type: 'view', name: 'daily_orders', metadata: {} }],
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

describe('workspace cross-view linking', () => {
    it('renders cross-view action buttons in table, lineage, and impact detail views', () => {
        const graph = createGraph();
        const table = graph.nodes.get('table:orders')!;
        const tableHtml = new TableExplorer().generateTableView({ table, graph });
        const lineageHtml = new LineageView().generateLineageGraphView(graph, 'table:orders');
        const report: ImpactReport = {
            changeType: 'modify',
            target: { type: 'table', name: 'orders' },
            directImpacts: [],
            transitiveImpacts: [],
            summary: {
                totalAffected: 0,
                tablesAffected: 0,
                viewsAffected: 0,
                queriesAffected: 0,
                filesAffected: 0,
            },
            severity: 'low',
            suggestions: [],
        };
        const impactHtml = new ImpactView().generateImpactReport(report);

        expect(tableHtml).toContain('data-action="cross-view-lineage"');
        expect(tableHtml).toContain('data-action="cross-view-impact"');
        expect(lineageHtml).toContain('data-action="cross-view-detail"');
        expect(lineageHtml).toContain('data-action="cross-view-impact"');
        expect(impactHtml).toContain('data-action="cross-view-lineage"');
        expect(impactHtml).toContain('data-action="cross-view-detail"');
    });

    it('handles cross-view actions through delegated client script logic', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });
        const css = getWebviewStyles(true);

        expect(script).toContain("action.indexOf('cross-view-') === 0");
        expect(script).toContain('prefillImpactForm');
        expect(script).toContain("switchToView('lineage'");
        expect(script).toContain("action === 'cross-view-detail'");
        expect(script).not.toContain('cross-view-table-explorer');
        expect(script).not.toContain("switchToView('tableExplorer'");
        expect(script).toContain("switchToView('impact'");
        expect(css).toContain('.cross-link-actions');
        expect(css).toContain('.cross-link-btn');
    });
});
