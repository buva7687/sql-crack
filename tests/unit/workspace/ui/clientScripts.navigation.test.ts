import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';

describe('workspace clientScripts navigation context', () => {
    it('stores and restores graph zoom/pan/selection state', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('scale,');
        expect(script).toContain('offsetX,');
        expect(script).toContain('offsetY,');
        expect(script).toContain('selectedNodeId');
        expect(script).toContain("restoreViewState('graph')");
    });

    it('shows contextual back label with originating node and clears stale origin on manual switches', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("Back to ' + (tabNames[prevView] || 'Graph') + fromLabel");
        expect(script).toContain("navigationOriginLabel = '';");
        expect(script).toContain("navigationOriginType = '';");
    });

    it('renders actionable workspace breadcrumb segments for context-preserving navigation', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('workspace-breadcrumb-segment is-clickable');
        expect(script).toContain('data-breadcrumb-action');
        expect(script).toContain("workspaceBreadcrumb?.addEventListener('click'");
        expect(script).toContain("action === 'detail-root'");
        expect(script).toContain("action === 'clear-column-trace'");
    });
});
