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

        expect(script).toContain("Back to Graph' + fromLabel");
        expect(script).toContain("navigationOriginLabel = '';");
        expect(script).toContain("navigationOriginType = '';");
        expect(script).toContain('lineageDetailView = false;');
        expect(script).toContain('updateBackButtonText();');
        expect(script).toContain("if (lineageDetailView && currentViewMode === 'lineage')");
        expect(script).toContain("switchToView('graph', true);");
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

    it('supports bottom workspace legend visibility via L shortcut and dismiss button', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('graphLegendStorageKey');
        expect(script).toContain('toggleGraphLegend');
        expect(script).toContain('workspace-legend-dismiss');
        expect(script).toContain('btn-legend-toggle');
        expect(script).toContain('graphLegendToggleBtn?.addEventListener(\'click\'');
        expect(script).toContain("if (e.key === 'l' || e.key === 'L')");
    });

    it('auto-fits graph after sidebar layout changes', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('function scheduleGraphAutoFit()');
        expect(script).toContain("document.getElementById('btn-sidebar')?.addEventListener('click'");
        expect(script).toContain("document.getElementById('btn-sidebar-close')?.addEventListener('click'");
        expect(script).toContain('scheduleGraphAutoFit();');
        expect(script).toContain('fitToScreen();');
    });

    it('uses view-specific skeleton variants for lineage and impact loading states', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('view-skeleton-lineage');
        expect(script).toContain('view-skeleton-impact');
        expect(script).not.toContain('view-skeleton-tables');
        expect(script).not.toContain("switchToTableExplorer");
        expect(script).not.toContain('tableExplorerResult');
    });

    it('preserves selected lineage direction when opening another node from search', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toMatch(/function selectLineageNode\(nodeId\) {[\s\S]*direction:\s*lineageCurrentDirection/);
        expect(script).not.toMatch(/function selectLineageNode\(nodeId\) {[\s\S]*direction:\s*'both'/);
    });

    it('wires graph sidebar cross-links for lineage, impact, and open-file actions', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("const selectionCrossLinks = document.getElementById('selection-cross-links');");
        expect(script).toContain("case 'view-lineage':");
        expect(script).toContain("case 'analyze-impact':");
        expect(script).toContain("case 'open-file':");
        expect(script).toContain("button.setAttribute('data-node-id', nodeId);");
        expect(script).toContain("button.setAttribute('data-file-path', filePath || '');");
    });

    it('synchronizes lineage overlay offsets with clamped legend height values', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('function syncLineageOverlayOffsets()');
        expect(script).toContain('Math.min(Math.max(measuredHeight, 0), 96)');
        expect(script).toContain("container.style.setProperty('--lineage-legend-height', legendHeight + 'px');");
        expect(script).toContain('window.addEventListener(\'resize\', lineageOverlayResizeHandler);');
    });
});
