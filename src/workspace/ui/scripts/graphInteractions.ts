/**
 * Script fragment: graph pan/zoom, selection/trace, legend, and search behavior.
 */
export function getGraphInteractionsScriptFragment(): string {
    return `
        function basenameFromPath(filePath) {
            const normalized = (filePath || '').replace(/\\\\/g, '/');
            return normalized.split('/').pop() || filePath || '';
        }

        function setGraphLegendVisible(visible) {
            if (!graphLegendBar) return;
            graphLegendBar.classList.toggle('is-hidden', !visible);
            graphLegendBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
            if (graphLegendToggleBtn) {
                graphLegendToggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
            }
            const graphAreaEl = document.getElementById('graph-area') || document.querySelector('.graph-area');
            if (graphAreaEl) {
                graphAreaEl.classList.toggle('graph-legend-visible', visible);
            }
        }

        function toggleGraphLegend(show) {
            if (!graphLegendBar) return;
            const nextVisible = typeof show === 'boolean' ? show : graphLegendBar.classList.contains('is-hidden');
            setGraphLegendVisible(nextVisible);
            try {
                localStorage.setItem(graphLegendStorageKey, nextVisible ? '1' : '0');
            } catch (error) {
                // localStorage may be unavailable in restricted webview contexts
            }
        }

        // ========== Zoom Functions ==========
        function updateTransform() {
            if (mainGroup) {
                mainGroup.setAttribute('transform', 'translate(' + offsetX + ',' + offsetY + ') scale(' + scale + ')');
            }
            if (zoomLevel) {
                zoomLevel.textContent = Math.round(scale * 100) + '%';
            }
        }

        function zoomIn() {
            scale = Math.min(3, scale * 1.2);
            updateTransform();
        }

        function zoomOut() {
            scale = Math.max(0.2, scale / 1.2);
            updateTransform();
        }

        function resetView() {
            scale = 1;
            offsetX = 50;
            offsetY = 50;
            updateTransform();
        }

        /**
         * Fit graph to screen using the same approach as Lineage view.
         * Uses .graph-area as the viewport container (not svg.parentElement) to get correct dimensions.
         * Uses getBBox() to get actual rendered bounds for accurate fitting.
         * Allows expansion up to 150% for small graphs to better utilize available space.
         */
        function fitToScreen() {
            if (!svg || !mainGroup) {
                if (zoomLevel) zoomLevel.textContent = '100%';
                return;
            }

            // Use .graph-area as the viewport container (matches Lineage's lineage-graph-container approach)
            // Query it each time to ensure we get the current element
            const container = document.querySelector('.graph-area');
            if (!container) {
                if (zoomLevel) zoomLevel.textContent = '100%';
                return;
            }

            // Use getBBox() to get actual rendered bounds of the SVG group (same as Lineage view)
            let bbox;
            try {
                bbox = mainGroup.getBBox();
            } catch (e) {
                // Fallback to node-based calculation if getBBox fails
                if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
                    scale = 1;
                    offsetX = 50;
                    offsetY = 50;
                    updateTransform();
                    return;
                }

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const node of graphData.nodes) {
                    if (node && typeof node.x === 'number' && typeof node.y === 'number') {
                        minX = Math.min(minX, node.x);
                        minY = Math.min(minY, node.y);
                        maxX = Math.max(maxX, node.x + (node.width || 200));
                        maxY = Math.max(maxY, node.y + (node.height || 80));
                    }
                }

                if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
                    scale = 1;
                    offsetX = 50;
                    offsetY = 50;
                    updateTransform();
                    return;
                }

                bbox = {
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY
                };
            }

            const containerRect = container.getBoundingClientRect();
            if (bbox.width <= 0 || bbox.height <= 0 || containerRect.width <= 0 || containerRect.height <= 0) {
                scale = 1;
                offsetX = 50;
                offsetY = 50;
                updateTransform();
                return;
            }

            // Work in pixel coordinates (no viewBox transformation) - same as Lineage
            const padding = 60;
            const availableWidth = containerRect.width - padding * 2;
            const availableHeight = containerRect.height - padding * 2;

            const scaleX = availableWidth / bbox.width;
            const scaleY = availableHeight / bbox.height;

            // Use the smaller scale to fit both dimensions
            // For small graphs, allow expansion up to 150% to better use available space
            // For large graphs, cap at 100% to prevent zooming in too much
            scale = Math.min(scaleX, scaleY);
            if (scale > 1.0) {
                // Graph is smaller than container - allow expansion up to 150%
                scale = Math.min(scale, 1.5);
            } else {
                // Graph is larger than container - cap at 100% (don't zoom in)
                scale = Math.min(scale, 1.0);
            }
            scale = Math.max(0.3, scale); // Minimum 30% to prevent too small

            // Calculate bbox center
            const bboxCenterX = bbox.x + bbox.width / 2;
            const bboxCenterY = bbox.y + bbox.height / 2;

            // Container center
            const containerCenterX = containerRect.width / 2;
            const containerCenterY = containerRect.height / 2;

            // Offset to center the scaled bbox in the container (same as Lineage)
            offsetX = containerCenterX - bboxCenterX * scale;
            offsetY = containerCenterY - bboxCenterY * scale;

            updateTransform();
        }

        function scheduleGraphAutoFit() {
            // Only auto-fit when Graph tab is active and the main graph is present.
            const graphTab = document.querySelector('.view-tab[data-view="graph"]');
            const isGraphTabActive = graphTab?.classList.contains('active');
            if (!isGraphTabActive || !svg || !mainGroup) {
                return;
            }

            if (graphLayoutFitTimer) {
                clearTimeout(graphLayoutFitTimer);
            }

            const delay = prefersReducedMotion ? 0 : (motionDurationMs + 40);
            graphLayoutFitTimer = setTimeout(() => {
                requestAnimationFrame(() => {
                    fitToScreen();
                });
            }, delay);
        }

        // ========== Selection & Focus Helpers ==========
        function clearFocusMode() {
            document.querySelectorAll('.node-focus-dim').forEach(node => node.classList.remove('node-focus-dim'));
            document.querySelectorAll('.edge-focus-dim').forEach(edge => edge.classList.remove('edge-focus-dim'));
        }

        function updateFocusButton() {
            if (!focusBtn) return;
            focusBtn.classList.toggle('active', focusModeEnabled);
            focusBtn.setAttribute('aria-pressed', focusModeEnabled ? 'true' : 'false');
        }

        function getNeighbors(nodeId) {
            const upstream = new Set();
            const downstream = new Set();
            document.querySelectorAll('.edge').forEach(edge => {
                const source = edge.getAttribute('data-source');
                const target = edge.getAttribute('data-target');
                if (!source || !target) return;
                if (target === nodeId) upstream.add(source);
                if (source === nodeId) downstream.add(target);
            });
            return { upstream, downstream };
        }

        function getNodeLabel(nodeId) {
            const nodeEl = document.querySelector('.node[data-id="' + CSS.escape(nodeId) + '"]');
            if (!nodeEl) return nodeId;
            return nodeEl.getAttribute('data-label') || nodeId;
        }

        function applyFocusMode() {
            if (!focusModeEnabled || !selectedNodeId) {
                clearFocusMode();
                return;
            }

            const neighbors = new Set([selectedNodeId]);
            const { upstream, downstream } = getNeighbors(selectedNodeId);
            upstream.forEach(id => neighbors.add(id));
            downstream.forEach(id => neighbors.add(id));

            document.querySelectorAll('.node').forEach(node => {
                const nodeId = node.getAttribute('data-id');
                if (!nodeId) return;
                node.classList.toggle('node-focus-dim', !neighbors.has(nodeId));
            });

            document.querySelectorAll('.edge').forEach(edge => {
                const source = edge.getAttribute('data-source');
                const target = edge.getAttribute('data-target');
                const keep = source && target && neighbors.has(source) && neighbors.has(target);
                edge.classList.toggle('edge-focus-dim', !keep);
            });
        }

        function setFocusMode(enabled) {
            focusModeEnabled = enabled;
            updateFocusButton();
            applyFocusMode();
        }

        // ========== Trace Mode (Full Lineage) ==========
        function traceAllUpstream(nodeId, visited = new Set()) {
            if (visited.has(nodeId)) return visited;
            visited.add(nodeId);
            const { upstream } = getNeighbors(nodeId);
            upstream.forEach(id => traceAllUpstream(id, visited));
            return visited;
        }

        function traceAllDownstream(nodeId, visited = new Set()) {
            if (visited.has(nodeId)) return visited;
            visited.add(nodeId);
            const { downstream } = getNeighbors(nodeId);
            downstream.forEach(id => traceAllDownstream(id, visited));
            return visited;
        }

        function clearTraceMode() {
            document.querySelectorAll('.node-trace-highlight').forEach(n => n.classList.remove('node-trace-highlight'));
            document.querySelectorAll('.node-trace-dim').forEach(n => n.classList.remove('node-trace-dim'));
            document.querySelectorAll('.edge-trace-highlight').forEach(e => e.classList.remove('edge-trace-highlight'));
            document.querySelectorAll('.edge-trace-dim').forEach(e => e.classList.remove('edge-trace-dim'));
        }

        function updateTraceButtons() {
            if (traceUpBtn) {
                traceUpBtn.classList.toggle('active', traceMode === 'upstream');
                traceUpBtn.setAttribute('aria-pressed', traceMode === 'upstream' ? 'true' : 'false');
            }
            if (traceDownBtn) {
                traceDownBtn.classList.toggle('active', traceMode === 'downstream');
                traceDownBtn.setAttribute('aria-pressed', traceMode === 'downstream' ? 'true' : 'false');
            }
        }

        function applyTraceMode() {
            clearTraceMode();
            if (!traceMode || !selectedNodeId) {
                updateTraceButtons();
                return;
            }

            const traced = traceMode === 'upstream'
                ? traceAllUpstream(selectedNodeId)
                : traceAllDownstream(selectedNodeId);

            document.querySelectorAll('.node').forEach(node => {
                const nodeId = node.getAttribute('data-id');
                if (!nodeId) return;
                if (traced.has(nodeId)) {
                    node.classList.add('node-trace-highlight');
                } else {
                    node.classList.add('node-trace-dim');
                }
            });

            document.querySelectorAll('.edge').forEach(edge => {
                const source = edge.getAttribute('data-source');
                const target = edge.getAttribute('data-target');
                if (source && target && traced.has(source) && traced.has(target)) {
                    edge.classList.add('edge-trace-highlight');
                } else {
                    edge.classList.add('edge-trace-dim');
                }
            });

            updateTraceButtons();
        }

        function setTraceMode(mode) {
            // Toggle off if same mode, otherwise set new mode
            traceMode = (traceMode === mode) ? null : mode;
            // Trace mode is mutually exclusive with focus mode
            if (traceMode && focusModeEnabled) {
                setFocusMode(false);
            }
            applyTraceMode();
        }

        function clearSelection() {
            selectedNodeId = null;
            document.querySelectorAll('.node-selected').forEach(node => node.classList.remove('node-selected'));
            if (focusModeEnabled) {
                setFocusMode(false);
            } else {
                clearFocusMode();
            }
            if (traceMode) {
                traceMode = null;
                clearTraceMode();
                updateTraceButtons();
            }
            if (selectionDetails) selectionDetails.style.display = 'none';
            if (selectionEmpty) {
                selectionEmpty.textContent = selectionEmptyText;
                selectionEmpty.style.display = '';
            }
            if (selectionCrossLinks) {
                selectionCrossLinks.style.display = 'none';
            }
            updateGraphActionButtons();
        }

        function updateGraphActionButtons() {
            const hasSelection = !!selectedNodeId;
            [focusBtn, traceUpBtn, traceDownBtn].forEach(btn => {
                if (!btn) return;
                btn.classList.toggle('btn-disabled', !hasSelection);
                btn.setAttribute('aria-disabled', hasSelection ? 'false' : 'true');
            });
        }

        function updateSelectionPanel(node) {
            const nodeId = node.getAttribute('data-id');
            if (!nodeId) return;

            selectedNodeId = nodeId;
            document.querySelectorAll('.node-selected').forEach(el => el.classList.remove('node-selected'));
            node.classList.add('node-selected');

            if (selectionDetails) selectionDetails.style.display = '';
            if (selectionEmpty) selectionEmpty.style.display = 'none';

            const label = node.getAttribute('data-label') || nodeId;
            const type = node.getAttribute('data-type') || 'node';
            const filePath = node.getAttribute('data-filepath') || '';

            const { upstream, downstream } = getNeighbors(nodeId);
            const connectionCount = upstream.size + downstream.size;
            const typeLabel = type === 'file'
                ? 'File'
                : type === 'table'
                    ? 'Table'
                    : type === 'view'
                        ? 'View'
                        : type === 'cte'
                            ? 'CTE'
                            : 'External';

            if (selectionTitle) selectionTitle.textContent = label;
            if (selectionMeta) {
                selectionMeta.textContent = typeLabel + ' • ' + connectionCount + ' connection' + (connectionCount === 1 ? '' : 's');
            }

            if (selectionFile) {
                if (filePath) {
                    selectionFile.textContent = filePath;
                    selectionFile.style.display = '';
                    selectionFile.title = filePath;
                } else {
                    selectionFile.style.display = 'none';
                    selectionFile.textContent = '';
                }
            }

            const upstreamList = Array.from(upstream).map(getNodeLabel);
            const downstreamList = Array.from(downstream).map(getNodeLabel);

            if (selectionUpstream) selectionUpstream.textContent = upstreamList.length ? upstreamList.join(', ') : 'None';
            if (selectionDownstream) selectionDownstream.textContent = downstreamList.length ? downstreamList.join(', ') : 'None';

            if (selectionCrossLinks) {
                const showCrossLinks = type === 'table' || type === 'view' || type === 'cte';
                selectionCrossLinks.style.display = showCrossLinks ? '' : 'none';

                selectionCrossLinks.querySelectorAll('[data-graph-action]').forEach(button => {
                    button.setAttribute('data-node-id', nodeId);
                    button.setAttribute('data-node-label', label);
                    button.setAttribute('data-node-type', type);
                    button.setAttribute('data-file-path', filePath || '');
                });

                const openFileAction = selectionCrossLinks.querySelector('[data-graph-action="open-file"]');
                if (openFileAction) {
                    openFileAction.style.display = filePath ? '' : 'none';
                }
            }

            if (focusModeEnabled) applyFocusMode();
            updateGraphActionButtons();
        }

        function markWelcomeSeen() {
            const state = vscode.getState() || {};
            if (!state.workspaceDepsWelcomeSeen) {
                state.workspaceDepsWelcomeSeen = true;
                vscode.setState(state);
            }
        }

        function setGraphEmptyState(state) {
            if (!graphEmptyOverlay || !graphEmptyTitle || !graphEmptyDesc || !graphEmptyActions) return;
            if (!state) {
                graphEmptyOverlay.classList.add('is-hidden');
                graphEmptyOverlay.setAttribute('aria-hidden', 'true');
                activeEmptyState = null;
                return;
            }

            graphEmptyTitle.textContent = state.title;
            graphEmptyDesc.textContent = state.description || '';
            graphEmptyDesc.style.display = state.description ? '' : 'none';
            graphEmptyActions.innerHTML = state.actionsHtml || '';
            graphEmptyOverlay.classList.remove('is-hidden');
            graphEmptyOverlay.setAttribute('aria-hidden', 'false');
            activeEmptyState = state.id;
        }

        function getSearchMatchCount(query, typeFilter) {
            if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return 0;
            const trimmedQuery = (query || '').trim();
            const hasQuery = trimmedQuery.length > 0;
            const queryLower = trimmedQuery.toLowerCase();
            const normalizedTypeFilter = Array.isArray(typeFilter) ? typeFilter[0] : typeFilter;
            let count = 0;

            for (const node of graphData.nodes) {
                if (!node) continue;
                if (normalizedTypeFilter && normalizedTypeFilter !== 'all' && node.type !== normalizedTypeFilter) continue;
                if (!hasQuery) {
                    count += 1;
                    continue;
                }

                const label = (node.label || node.id || '').toString();
                const filePath = (node.filePath || '').toString();
                const haystack = (label + ' ' + filePath).toLowerCase();
                if (haystack.includes(queryLower)) {
                    count += 1;
                }
            }

            return count;
        }

        function updateGraphEmptyState() {
            if (!graphEmptyOverlay) return;
            if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
                setGraphEmptyState(null);
                return;
            }

            const query = searchInput ? searchInput.value.trim() : '';
            const typeFilter = filterType ? filterType.value : 'all';
            const searchActive = Boolean(query) || typeFilter !== 'all';

            if (searchActive) {
                const matchCount = getSearchMatchCount(query, typeFilter);
                if (matchCount === 0) {
                    setGraphEmptyState({
                        id: 'no-matches',
                        title: 'No matches for this search',
                        description: 'Try clearing filters or changing your search terms.',
                        actionsHtml: '<button class="action-chip" data-graph-action="clear-search">Clear search</button>' +
                            '<button class="action-chip" data-graph-action="focus-search">Search again</button>'
                    });
                    return;
                }
            }

            const state = vscode.getState() || {};
            if (!searchActive && !state.workspaceDepsWelcomeSeen) {
                setGraphEmptyState({
                    id: 'welcome',
                    title: 'Workspace dependencies at a glance',
                    description: 'This graph shows how your SQL files, tables, and views connect across the workspace.',
                    actionsHtml: '<button class="action-chip" data-graph-action="focus-search">Search for a table</button>' +
                        '<button class="action-chip" data-graph-action="switch-graph-mode" data-mode="tables">Show tables</button>' +
                        '<button class="action-chip" data-graph-action="switch-graph-mode" data-mode="files">Show files</button>' +
                        '<button class="action-chip" data-graph-action="view-issues">View issues</button>' +
                        '<button class="action-chip" data-graph-action="refresh">Refresh index</button>' +
                        '<button class="action-chip" data-graph-action="dismiss-welcome">Dismiss</button>'
                });
                return;
            }

            setGraphEmptyState(null);
        }

        updateFocusButton();

        if (graphLegendBar) {
            let showGraphLegend = true;
            try {
                const storedLegend = localStorage.getItem(graphLegendStorageKey);
                if (storedLegend !== null) {
                    showGraphLegend = storedLegend === '1';
                }
            } catch (error) {
                // localStorage may be unavailable in restricted webview contexts
            }
            setGraphLegendVisible(showGraphLegend);
            graphLegendDismiss?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleGraphLegend(false);
            });
            graphLegendToggleBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleGraphLegend();
            });
        }

        // ========== Pan/Zoom Setup ==========
        if (svg && mainGroup) {
            updateTransform();

            svg.addEventListener('mousedown', (e) => {
                if (e.target === svg) {
                    isDragging = true;
                    dragStartX = e.clientX - offsetX;
                    dragStartY = e.clientY - offsetY;
                    svg.style.cursor = 'grabbing';
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    offsetX = e.clientX - dragStartX;
                    offsetY = e.clientY - dragStartY;
                    updateTransform();
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                if (svg) svg.style.cursor = 'grab';
            });

            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                scale = Math.max(0.2, Math.min(3, scale * delta));
                updateTransform();
            }, { passive: false });
        }

        // ========== Zoom Toolbar Events ==========
        document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
        document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
        document.getElementById('btn-zoom-reset')?.addEventListener('click', resetView);
        document.getElementById('btn-zoom-fit')?.addEventListener('click', fitToScreen);

        // Auto-fit graph to screen on initial load to use available space.
        // Hide graph during transition to prevent flickering (zoom change from 100% to fitted).
        if (svg && mainGroup && graphData && graphData.nodes && graphData.nodes.length > 0) {
            const graphArea = document.querySelector('.graph-area');
            if (graphArea) {
                // Hide graph during fit calculation to prevent flicker
                graphArea.style.opacity = '0';
                graphArea.style.transition = prefersReducedMotion ? 'none' : 'opacity 0.2s ease-in';
            }
            
            // Use requestAnimationFrame to ensure DOM is ready, then fit immediately
            requestAnimationFrame(() => {
                // Fit to screen synchronously (no setTimeout delay to reduce flicker)
                fitToScreen();
                
                // Show graph after fitting is complete (next frame)
                if (graphArea) {
                    requestAnimationFrame(() => {
                        graphArea.style.opacity = '1';
                    });
                }
            });
        }

        // ========== Search Functions ==========
        function applySearchHighlight() {
            if (!svg) return;
            const query = searchInput ? searchInput.value.trim() : '';
            const typeFilter = filterType ? filterType.value : 'all';
            const searchActive = Boolean(query) || typeFilter !== 'all';
            const queryLower = query.toLowerCase();

            document.querySelectorAll('.node').forEach(node => {
                node.classList.remove('node-search-match', 'node-search-dim');
                if (!searchActive) return;

                const nodeType = node.getAttribute('data-type') || '';
                if (typeFilter !== 'all' && nodeType !== typeFilter) {
                    node.classList.add('node-search-dim');
                    return;
                }

                if (!query) {
                    node.classList.add('node-search-match');
                    return;
                }

                const label = node.getAttribute('data-label') || '';
                const filePath = node.getAttribute('data-filepath') || '';
                const haystack = (label + ' ' + filePath).toLowerCase();
                if (haystack.includes(queryLower)) {
                    node.classList.add('node-search-match');
                } else {
                    node.classList.add('node-search-dim');
                }
            });
        }

        function performSearch() {
            const query = searchInput.value.trim();
            const typeFilter = filterType.value;

            if (!query && typeFilter === 'all') {
                clearSearch();
                return;
            }

            let nodeTypes = undefined;
            if (typeFilter !== 'all') {
                nodeTypes = [typeFilter];
            }

            vscode.postMessage({
                command: 'search',
                filter: { query, nodeTypes, useRegex: false, caseSensitive: false }
            });

            btnClearSearch.classList.toggle('visible', query || typeFilter !== 'all');
            updateGraphEmptyState();
            applySearchHighlight();
            if (searchCount) {
                const total = graphData?.nodes?.length || 0;
                const matched = getSearchMatchCount(query, typeFilter);
                searchCount.textContent = matched + ' / ' + total;
                searchCount.style.display = '';
            }
        }

        function clearSearch() {
            searchInput.value = '';
            filterType.value = 'all';
            btnClearSearch.classList.remove('visible');
            vscode.postMessage({ command: 'clearSearch' });
            updateGraphEmptyState();
            applySearchHighlight();
            if (searchCount) { searchCount.textContent = ''; searchCount.style.display = 'none'; }
        }

        let searchTimeout;
        function debouncedSearch() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 500); // 500ms delay for smoother typing
        }

        searchInput?.addEventListener('input', debouncedSearch);
        filterType?.addEventListener('change', performSearch);
        btnClearSearch?.addEventListener('click', clearSearch);
        updateGraphEmptyState();
        applySearchHighlight();

    `;
}
