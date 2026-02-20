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
        expect(script).not.toContain('btn-legend-toggle');
        expect(script).not.toContain('graphLegendToggleBtn?.addEventListener(\'click\'');
        expect(script).toContain("if (e.key === 'l' || e.key === 'L')");
    });

    it('clears active column trace panel on Escape before graph search/selection handling', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("if (!isTyping && window.__workspaceColumnTraceActive && typeof window.clearWorkspaceColumnTrace === 'function')");
        expect(script).toContain('window.clearWorkspaceColumnTrace();');
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

        expect(script).toMatch(/function selectLineageNode\(nodeId,\s*nodeLabel,\s*nodeType\) {[\s\S]*direction:\s*lineageCurrentDirection/);
        expect(script).not.toMatch(/function selectLineageNode\(nodeId,\s*nodeLabel,\s*nodeType\) {[\s\S]*direction:\s*'both'/);
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
        expect(script).toContain("case 'show-file-tables':");
        expect(script).toContain("case 'open-file':");
        expect(script).toContain("case 'trace-upstream':");
        expect(script).toContain("case 'trace-downstream':");
        expect(script).toContain("case 'clear-graph-state':");
        expect(script).toContain("button.setAttribute('data-node-id', nodeId);");
        expect(script).toContain("button.setAttribute('data-file-path', filePath || '');");
        expect(script).toContain("lineageTitle.textContent = 'Data Lineage';");
        expect(script).toContain('selectLineageNode(nodeId, nodeLabel, nodeType);');
        expect(script).toContain("command: 'getUpstream'");
        expect(script).toContain("nodeType: 'file'");
    });

    it('wires graph onboarding helper actions and explain panel toggle state', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("const graphExplainPanel = document.getElementById('graph-explain-panel');");
        expect(script).toContain("const graphKeyboardHints = document.getElementById('graph-keyboard-hints');");
        expect(script).toContain("const graphZoomToolbar = document.querySelector('.zoom-toolbar');");
        expect(script).toContain('function setGraphExplainPanelVisible(visible)');
        expect(script).toContain('function toggleGraphExplainPanel()');
        expect(script).toContain('function syncGraphOverlayChrome()');
        expect(script).toContain("graphKeyboardHints.classList.toggle('is-hidden', overlayActive);");
        expect(script).toContain("graphZoomToolbar.classList.toggle('is-hidden', overlayActive);");
        expect(script).toContain("state.workspaceDepsWhyPanelDismissed = !visible;");
        expect(script).toContain("const hasSavedDismissedPreference = Object.prototype.hasOwnProperty.call(state, 'workspaceDepsWhyPanelDismissed');");
        expect(script).toContain("case 'why-this-graph':");
        expect(script).toContain("if (activeEmptyState === 'welcome')");
        expect(script).toContain('setGraphExplainPanelVisible(true);');
        expect(script).toContain("case 'dismiss-why':");
    });

    it('wires opt-in workspace UX instrumentation hooks for core graph actions', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('function trackUxEvent(eventName, metadata)');
        expect(script).toContain("command: 'trackUxEvent'");
        expect(script).toContain("trackUxEvent('workspace_view_switched'");
        expect(script).toContain("trackUxEvent('graph_mode_switched'");
        expect(script).toContain("trackUxEvent('graph_trace_in_lineage'");
        expect(script).toContain("trackUxEvent('graph_analyze_in_impact'");
        expect(script).toContain("trackUxEvent('graph_search_submitted'");
        expect(script).toContain("trackUxEvent('graph_search_jump'");
    });

    it('captures graph-search-count element and updates it in performSearch/clearSearch', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("const searchPrevBtn = document.getElementById('btn-search-prev');");
        expect(script).toContain("const searchNextBtn = document.getElementById('btn-search-next');");
        expect(script).toContain("const searchCount = document.getElementById('graph-search-count');");
        expect(script).toContain('function refreshSearchNavigation(query)');
        expect(script).toContain("searchCount.textContent = matched + ' / ' + total;");
        expect(script).toContain("searchCount.style.display = '';");
        expect(script).toContain("searchCount.style.display = 'none';");
        expect(script).toContain('function jumpToSearchMatch(direction)');
        expect(script).toContain("searchPrevBtn?.addEventListener('click', () => jumpToSearchMatch(-1));");
        expect(script).toContain("searchNextBtn?.addEventListener('click', () => jumpToSearchMatch(1));");
        expect(script).toContain("if (event.key === 'Enter')");
        expect(script).toContain("jumpToSearchMatch(event.shiftKey ? -1 : 1);");
        expect(script).toContain("if (typeof scrollNodeIntoView === 'function')");
    });

    it('marks current search match distinctly while keeping matched nodes highlighted', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("let searchMatchNodeIds = [];");
        expect(script).toContain("let activeSearchMatchIndex = -1;");
        expect(script).toContain("node.classList.remove('node-search-match', 'node-search-dim', 'node-search-current');");
        expect(script).toContain("node.classList.add('node-search-match');");
        expect(script).toContain("node.classList.add('node-search-current');");
        expect(script).toContain('function updateSearchNavigationButtons()');
        expect(script).toContain("searchPrevBtn.classList.toggle('btn-disabled', !hasMatches);");
        expect(script).toContain("searchNextBtn.classList.toggle('btn-disabled', !hasMatches);");
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

    it('auto-fit uses responsive padding and allows moderate zoom-in for sparse lineage graphs', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('const padding = Math.max(18, Math.min(36');
        expect(script).toContain('lineageScale = Math.max(0.3, Math.min(1.4, lineageScale));');
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
