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

    it('renders a disabled-state hint below the analyze button with aria linkage', () => {
        const html = new ImpactView().generateImpactForm(createGraph());

        expect(html).toContain('id="impact-analyze-hint"');
        expect(html).toContain('class="form-hint"');
        expect(html).toContain('Select a table or view above to analyze impact');
        expect(html).toContain('aria-describedby="impact-analyze-hint"');
    });

    it('toggles analyze hint visibility when table selection changes', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });
        const css = getWebviewStyles(true);

        expect(script).toContain('impact-analyze-hint');
        expect(script).toContain("analyzeHint.classList.toggle('hidden'");
        expect(css).toContain('.form-hint');
        expect(css).toContain('.form-hint.hidden');
    });

    it('wires impact report export buttons to markdown/json export commands', () => {
        const reportHtml = new ImpactView().generateImpactReport({
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
        });

        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(reportHtml).toContain('data-action="export-impact-report"');
        expect(reportHtml).toContain('data-format="markdown"');
        expect(reportHtml).toContain('data-format="json"');
        expect(reportHtml).not.toContain('onclick=');
        expect(script).toContain("if (action === 'export-impact-report')");
        expect(script).toContain("const format = requested === 'json' ? 'impact-json' : 'impact-markdown'");
        expect(script).toContain("command: 'export'");
    });
});
