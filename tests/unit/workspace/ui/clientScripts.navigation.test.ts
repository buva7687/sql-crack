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
        expect(script).toContain('function getViewScrollContainer(view)');
        expect(script).toContain("root.querySelector('.view-container')");
        expect(script).toContain('requestAnimationFrame(() => requestAnimationFrame(() => {');
        expect(script).toContain("const parts = raw.split(/[\\\\/]+/).filter(Boolean);");
    });

    it('shows contextual back label with originating node and clears stale origin on manual switches', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("lineageBackBtn.appendChild(document.createTextNode(' Back to Graph' + fromLabel));");
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
        expect(script).toContain('window.captureLineageSearchState = captureLineageSearchState;');
        expect(script).toContain('captureLineageSearchState();');
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

    it('captures graph-search-count element and updates it in performSearch/clearSearch', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("const searchCount = document.getElementById('graph-search-count');");
        expect(script).toContain("searchCount.textContent = matched + ' / ' + total;");
        expect(script).toContain("searchCount.style.display = 'none';");
    });

    it('toggles btn-disabled class on focus/trace buttons via updateGraphActionButtons', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('function updateGraphActionButtons()');
        expect(script).toContain("btn.classList.toggle('btn-disabled', !hasSelection);");
        expect(script).toContain("btn.setAttribute('aria-disabled'");
        expect(script).toContain('updateGraphActionButtons();');
    });

    it('re-initializes lineage legend bar after each graph result to prevent overlap', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        // processLineageGraphResult must call initializeLineageLegendBar after DOM injection
        expect(script).toMatch(/setupMinimap\(\);\s*\n\s*initializeLineageLegendBar\(\);/);
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

    it('applies configured lineage depth and listens for runtime depth updates', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
            lineageDefaultDepth: 12,
        });

        expect(script).toContain('let lineageDepth = 12;');
        expect(script).toContain('case \'workspaceLineageDepthUpdated\':');
        expect(script).toContain('lineageDepth = normalizeLineageDepth(message.depth, lineageDepth);');
        expect(script).toContain('command: \'getLineageGraph\'');
    });

    it('registers wheel handlers as non-passive where preventDefault is used', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        const passiveWheelListeners = script.match(/addEventListener\('wheel'[\s\S]*?\{\s*passive:\s*false\s*}\);/g) || [];
        expect(passiveWheelListeners.length).toBeGreaterThanOrEqual(2);
    });

    it('restores non-graph scroll state after lineage and impact HTML re-renders', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("case 'lineageOverviewResult':");
        expect(script).toContain("case 'impactFormResult':");
        expect(script).toContain("case 'impactResult':");
        expect(script).toContain('restoreViewState(currentViewMode);');
    });
});
