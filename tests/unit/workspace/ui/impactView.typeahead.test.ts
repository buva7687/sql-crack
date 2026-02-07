import { ImpactView } from '../../../../src/workspace/ui/impactView';
import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';
import { getWebviewStyles } from '../../../../src/workspace/ui/sharedStyles';
import { LineageGraph } from '../../../../src/workspace/lineage/types';

function createGraph(): LineageGraph {
    return {
        nodes: new Map([
            ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
            ['view:daily_orders', { id: 'view:daily_orders', type: 'view', name: 'daily_orders', metadata: {} }],
        ]),
        edges: [],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

describe('ImpactView typeahead selection', () => {
    it('renders a typeahead selector and removes legacy dual search/select controls', () => {
        const html = new ImpactView().generateImpactForm(createGraph());

        expect(html).toContain('id="impact-table-input"');
        expect(html).toContain('id="impact-table-id"');
        expect(html).toContain('id="impact-typeahead-results"');
        expect(html).toContain('class="impact-typeahead-item"');
        expect(html).toContain('id="impact-selected-badge"');
        expect(html).not.toContain('impact-table-select');
        expect(html).not.toContain('impact-search-input');
        expect(html).not.toContain('impact-results-info');
    });

    it('wires typeahead behavior in client script and defines corresponding styles', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });
        const css = getWebviewStyles(true);

        expect(script).toContain('impact-typeahead-item');
        expect(script).toContain('impact-table-id');
        expect(script).toContain('impact-selected-badge');
        expect(script).not.toContain('impact-table-select');
        expect(script).not.toContain('impact-search-input');

        expect(css).toContain('.impact-typeahead');
        expect(css).toContain('.impact-typeahead-results');
        expect(css).toContain('.impact-typeahead-item');
        expect(css).toContain('.impact-selected-badge');
    });
});
