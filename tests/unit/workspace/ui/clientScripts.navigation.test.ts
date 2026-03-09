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
        expect(script).toContain("if (lineageDetailView && currentViewMode === 'lineage' && !navigationOriginLabel)");
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

    it('guards lineage and impact view HTML against stale cross-view responses', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("case 'impactFormResult':");
        expect(script).toContain("if (currentViewMode !== 'impact') break;");
        expect(script).toContain("case 'lineageOverviewResult':");
        expect(script).toContain("if (currentViewMode !== 'lineage') break;");
    });

    it('uses host-synced breadcrumb navigation instead of local-only skipMessage shortcuts', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("if (action === 'view' && value) {");
        expect(script).toContain("if (value === currentViewMode && lineageDetailView && value !== 'graph') {");
        expect(script).toContain('restoreWorkspaceViewRoot(value);');
        expect(script).toContain('switchToView(value);');
        expect(script).toContain("if (action === 'origin') {");
        expect(script).toContain("switchToView('graph');");
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

    it('surfaces lineage graph errors and reuses document-level lineage handlers across rerenders', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("if (message.data?.error) {");
        expect(script).toContain("showWorkspaceAlert(lineageContent, message.data.error, message.data.reason, 'Lineage graph unavailable');");
        expect(script).toContain('let lineageDocumentMouseMoveHandler = null;');
        expect(script).toContain('let lineageDocumentMouseUpHandler = null;');
        expect(script).toContain('let lineageDocumentClickHandler = null;');
        expect(script).toContain("document.removeEventListener('mousemove', lineageDocumentMouseMoveHandler);");
        expect(script).toContain("document.removeEventListener('mouseup', lineageDocumentMouseUpHandler);");
        expect(script).toContain("document.removeEventListener('click', lineageDocumentClickHandler);");
        expect(script).toContain("document.addEventListener('mousemove', lineageDocumentMouseMoveHandler);");
        expect(script).toContain("document.addEventListener('mouseup', lineageDocumentMouseUpHandler);");
        expect(script).toContain("document.addEventListener('click', lineageDocumentClickHandler);");
    });

    it('tracks workspace request ids across async scopes and restores cached impact html after rebuild', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'impact',
            currentGraphMode: 'tables',
            initialRestoreState: {
                impact: {
                    hasReport: true,
                    html: '<div>impact-report</div>',
                },
            },
        });

        expect(script).toContain("switchToImpactView: ['impact-form', 'impact-result']");
        expect(script).toContain("lineageResult: 'flow-result'");
        expect(script).toContain('const initialWorkspaceRestoreState = {"impact":{"hasReport":true,"html":"<div>impact-report</div>"}};');
        expect(script).toContain("persistImpactResult(message.data.html, message.data.report || null);");
        expect(script).toContain("if (persistedImpact.html && lineageContent) {");
        expect(script).toContain("lineageDetailView = true;");
    });

    it('includes the shared workspace command/search overlay and recovery search actions', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("const workspaceCommandBtn = document.getElementById('btn-workspace-command');");
        expect(script).toContain("if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')");
        expect(script).toContain('let pendingWorkspaceSearchFocus = \'\';');
        expect(script).toContain('function requestWorkspaceSearchFocus(targetView)');
        expect(script).toContain("restoreWorkspaceViewRoot(normalizedTargetView);");
        expect(script).toContain("requestWorkspaceSearchFocus(currentViewMode)");
        expect(script).toContain("flushPendingWorkspaceSearchFocus('lineage');");
        expect(script).toContain("flushPendingWorkspaceSearchFocus('impact');");
    });

    it('treats impact reports as in-tab detail state so back returns to the impact form', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("} else if (lineageDetailView && currentViewMode === 'impact') {");
        expect(script).toContain("Back to Impact");
        expect(script).toContain("function restoreWorkspaceViewRoot(view = currentViewMode)");
        expect(script).toContain("command: targetView === 'lineage' ? 'switchToLineageView' : 'switchToImpactView'");
    });

    it('keeps main lineage filtering on direct matches instead of fuzzy subsequence matches', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('function scoreLineageMatch(name, query) {');
        expect(script).toContain('const containsIndex = target.indexOf(needle);');
        expect(script).toContain('return null;');
        expect(script).not.toContain('indices.push(idx);');
    });

    it('conditionally zooms graph search results when a single or compact match set is selected', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('function getCombinedNodeBounds(nodes)');
        expect(script).toContain('function zoomGraphToBounds(bounds, zoomCap)');
        expect(script).toContain('function focusSearchMatchNode(targetNode, autoZoom = true)');
        expect(script).toContain('if (searchMatchNodeIds.length > 0 && searchMatchNodeIds.length <= 3) {');
        expect(script).toContain("jumpToSearchMatch(0, { autoZoom: true, track: false });");
        expect(script).toContain('focusSearchMatchNode(targetNode, options.autoZoom !== false);');
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
        expect(script).toContain("command: 'getLineageGraph'");
        expect(script).toContain("command: 'getUpstream'");
        expect(script).toContain("nodeType: 'file'");
        expect(script).toContain("const selectionEdgeDetails = document.getElementById('selection-edge-details');");
        expect(script).toContain("function updateEdgeSelectionPanel(edge)");
        expect(script).toContain("case 'open-edge-reference':");
        expect(script).toContain("data-reference-samples");
        expect(script).toContain("const selectionPathSummary = document.getElementById('selection-path-summary');");
        expect(script).toContain('function findShortestPath(sourceId, targetId)');
        expect(script).toContain('function applyPathHighlight(pathNodeIds)');
        expect(script).toContain("case 'path-set-start':");
        expect(script).toContain("case 'path-set-end':");
        expect(script).toContain("case 'path-show':");
        expect(script).toContain("case 'path-clear':");
        expect(script).toContain("trackUxEvent('graph_path_shown'");
        expect(script).toContain("clearPathState(true);");
    });

    it('routes context-menu lineage and impact actions with canonical ids and safe view/table impact types', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("nodeId: contextMenuTarget.id,");
        expect(script).toContain("var impactType = contextMenuTarget.type === 'view' ? 'view' : 'table';");
        expect(script).toContain('type: impactType,');
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
        expect(script).toContain("searchCount.textContent = matched > 0 ? (pos + ' of ' + matched) : 'No matches';");
        expect(script).toContain("searchCount.style.display = 'inline';");
        expect(script).toContain("searchCount.style.display = 'none';");
        expect(script).toContain('function jumpToSearchMatch(direction, options = {})');
        expect(script).toContain("searchPrevBtn?.addEventListener('click', () => jumpToSearchMatch(-1));");
        expect(script).toContain("searchNextBtn?.addEventListener('click', () => jumpToSearchMatch(1));");
        expect(script).toContain("if (event.key === 'Enter')");
        expect(script).toContain("jumpToSearchMatch(event.shiftKey ? -1 : 1);");
        expect(script).toContain('focusSearchMatchNode(targetNode, options.autoZoom !== false);');
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

    it('exposes fuzzy suggestions for no-match searches and routes suggestion chips', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('function getFuzzySuggestions(query, limit = 3)');
        expect(script).toContain("data-graph-action=\"apply-suggestion\"");
        expect(script).toContain("case 'apply-suggestion':");
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

    it('restores lineage detail requests across webview rebuilds', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'lineage',
            currentGraphMode: 'tables',
            lineageDetailNodeId: 'table:orders',
            lineageDetailDirection: 'downstream',
            lineageDetailExpandedNodes: ['table:orders', 'view:daily_orders'],
        });

        expect(script).toContain('const initialLineageDetailNodeId = "table:orders";');
        expect(script).toContain('const initialLineageDetailDirection = "downstream";');
        expect(script).toContain('const initialLineageDetailExpandedNodes = ["table:orders","view:daily_orders"];');
        expect(script).toContain("if (typeof initialLineageDetailNodeId !== 'undefined' && initialLineageDetailNodeId) {");
        expect(script).toContain("command: 'getLineageGraph'");
        expect(script).toContain('nodeId: initialLineageDetailNodeId,');
        expect(script).toContain("direction: typeof initialLineageDetailDirection !== 'undefined' ? initialLineageDetailDirection : 'both'");
        expect(script).toContain("expandedNodes: typeof initialLineageDetailExpandedNodes !== 'undefined' ? initialLineageDetailExpandedNodes : []");
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

    it('suppresses welcome overlay when graph has fewer than 3 nodes', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        // Welcome overlay gate: only shown when nodeCount >= 3
        expect(script).toContain('nodeCount >= 3');
        expect(script).toContain("id: 'welcome'");
        expect(script).toContain('workspaceDepsWelcomeSeen');
    });

    it('switches search placeholder text based on current graph mode', () => {
        const tablesScript = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        const filesScript = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'files',
        });

        // Client-side mode context sets different placeholders
        expect(tablesScript).toContain("placeholder: 'Search table/view names...'");
        expect(tablesScript).toContain("placeholder: 'Search file names...'");
        expect(tablesScript).toContain('searchInput.placeholder = context.placeholder');

        // Server-side initial placeholder differs by mode
        expect(tablesScript).toContain('Search table/view names...');
        expect(filesScript).toContain('Search file names...');
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

    it('decodes tooltip and edge-reference payloads as UTF-8 instead of Latin-1', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64Value), c => c.charCodeAt(0))))');
        expect(script).toContain('new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)))');
    });

    it('does not reference removed header focus button bindings', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).not.toContain('focusBtn');
        expect(script).not.toContain('btn-focus');
    });
});
