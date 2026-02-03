// Client Scripts - JavaScript for workspace webviews
// Extracted from workspacePanel.ts for modularity

/**
 * Parameters for generating webview script
 */
export interface WebviewScriptParams {
    nonce: string;
    graphData: string;
    searchFilterQuery: string;
    initialView?: string;
    currentGraphMode?: 'files' | 'tables' | 'hybrid';
}

/**
 * Generate the complete client script for main webview
 */
export function getWebviewScript(params: WebviewScriptParams): string {
    const { nonce, graphData, searchFilterQuery, initialView = 'graph', currentGraphMode = 'tables' } = params;

    return `
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const graphData = ${graphData};
        const initialViewMode = '${initialView}';
        let currentGraphMode = '${currentGraphMode}';

        // ========== Pan and Zoom State ==========
        let scale = 1;
        let offsetX = 50;
        let offsetY = 50;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        // ========== DOM Elements ==========
        const svg = document.getElementById('graph-svg');
        const mainGroup = document.getElementById('main-group');
        const searchInput = document.getElementById('search-input');
        const filterType = document.getElementById('filter-type');
        const btnClearSearch = document.getElementById('btn-clear-search');
        const sidebar = document.getElementById('sidebar');
        const zoomLevel = document.getElementById('zoom-level');
        const tooltip = document.getElementById('tooltip');
        const focusBtn = document.getElementById('btn-focus');
        const selectionEmpty = document.getElementById('selection-empty');
        const selectionDetails = document.getElementById('selection-details');
        const selectionTitle = document.getElementById('selection-title');
        const selectionMeta = document.getElementById('selection-meta');
        const selectionFile = document.getElementById('selection-file');
        const selectionUpstream = document.getElementById('selection-upstream');
        const selectionDownstream = document.getElementById('selection-downstream');
        const selectionEmptyText = (selectionEmpty && selectionEmpty.textContent) ? selectionEmpty.textContent : 'Click a node to see details and paths.';

        // ========== Selection & Focus State ==========
        let selectedNodeId = null;
        let focusModeEnabled = false;

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

        function clearSelection() {
            selectedNodeId = null;
            document.querySelectorAll('.node-selected').forEach(node => node.classList.remove('node-selected'));
            if (focusModeEnabled) {
                setFocusMode(false);
            } else {
                clearFocusMode();
            }
            if (selectionDetails) selectionDetails.style.display = 'none';
            if (selectionEmpty) {
                selectionEmpty.textContent = selectionEmptyText;
                selectionEmpty.style.display = '';
            }
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
            const typeLabel = type === 'file' ? 'File' : type === 'table' ? 'Table' : type === 'view' ? 'View' : 'External';

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

            if (focusModeEnabled) applyFocusMode();
        }

        updateFocusButton();

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
            });
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
                graphArea.style.transition = 'opacity 0.2s ease-in';
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
        }

        function clearSearch() {
            searchInput.value = '';
            filterType.value = 'all';
            btnClearSearch.classList.remove('visible');
            vscode.postMessage({ command: 'clearSearch' });
        }

        let searchTimeout;
        function debouncedSearch() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 300);
        }

        searchInput?.addEventListener('input', debouncedSearch);
        filterType?.addEventListener('change', performSearch);
        btnClearSearch?.addEventListener('click', clearSearch);

        // ========== Keyboard Shortcuts ==========
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInput?.focus();
                searchInput?.select();
            }
            if (e.key === 'Escape' && document.activeElement === searchInput) {
                searchInput.blur();
                clearSearch();
            }
        });

        // ========== Sidebar Toggle ==========
        document.getElementById('btn-sidebar')?.addEventListener('click', () => {
            sidebar?.classList.toggle('collapsed');
        });
        document.getElementById('btn-sidebar-close')?.addEventListener('click', () => {
            sidebar?.classList.add('collapsed');
        });

        // ========== Section Toggles ==========
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('expanded');
            });
        });

        // ========== Commands ==========
        function refresh() { vscode.postMessage({ command: 'refresh' }); }
        function openFile(filePath) { vscode.postMessage({ command: 'openFile', filePath }); }
        function openFileAtLine(filePath, line) { vscode.postMessage({ command: 'openFileAtLine', filePath, line }); }
        function visualizeFile(filePath) { vscode.postMessage({ command: 'visualizeFile', filePath }); }
        function focusSearch() {
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }

        function switchGraphModeFromAction(mode) {
            if (!mode) return;
            vscode.postMessage({ command: 'switchGraphMode', mode });
        }

        document.getElementById('btn-refresh')?.addEventListener('click', refresh);
        document.getElementById('btn-theme')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'toggleTheme' });
        });
        focusBtn?.addEventListener('click', () => {
            const nextState = !focusModeEnabled;
            setFocusMode(nextState);
            if (selectionEmpty) {
                selectionEmpty.textContent = nextState && !selectedNodeId
                    ? 'Select a node to focus on its neighbors.'
                    : selectionEmptyText;
            }
        });
        document.getElementById('btn-view-issues')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'issues' });
        });
        document.getElementById('btn-all-issues')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'issues' });
        });

        document.addEventListener('click', (e) => {
            const actionEl = e.target.closest('[data-graph-action]');
            if (!actionEl) return;

            const action = actionEl.getAttribute('data-graph-action');
            if (!action) return;

            switch (action) {
                case 'focus-search':
                    focusSearch();
                    break;
                case 'clear-search':
                    clearSearch();
                    break;
                case 'refresh':
                    refresh();
                    break;
                case 'view-issues':
                    vscode.postMessage({ command: 'switchView', view: 'issues' });
                    break;
                case 'switch-graph-mode': {
                    const mode = actionEl.getAttribute('data-mode');
                    switchGraphModeFromAction(mode);
                    break;
                }
                case 'focus-selection':
                    if (selectedNodeId) {
                        setFocusMode(true);
                    } else if (selectionEmpty) {
                        selectionEmpty.textContent = 'Select a node to focus on its neighbors.';
                    }
                    break;
                case 'clear-selection':
                    clearSelection();
                    break;
            }
        });

        // ========== Export Buttons ==========
        document.querySelectorAll('.export-btn[data-format]').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.getAttribute('data-format');
                if (format) vscode.postMessage({ command: 'export', format });
            });
        });

        ${getViewModeScript()}
        ${getContextMenuScript()}
        ${getMessageHandlingScript()}
        ${getEventDelegationScript()}
        ${getNodeInteractionsScript()}
        ${getTooltipScript()}
        ${getImpactSummaryScript()}
        ${getImpactFormScript()}
        ${getTableSearchScript()}
        ${getVisualLineageSearchScript()}
        ${getLineageGraphScript()}
        ${getColumnLineageScript()}
        ${getDirectionButtonsScript()}
        ${getUtilityScript()}
    </script>`;
}

function getViewModeScript(): string {
    return `
        // ========== View Mode Tabs ==========
        let currentViewMode = 'graph';
        let lineageDetailView = false;
        let tableExplorerHistory = []; // Stack of {tableName, nodeId} for back navigation
        let currentExploredTable = null; // Currently viewed table {tableName, nodeId}
        const viewTabs = document.querySelectorAll('.view-tab');
        const lineagePanel = document.getElementById('lineage-panel');
        const lineageContent = document.getElementById('lineage-content');
        const lineageTitle = document.getElementById('lineage-title');
        const lineageBackBtn = document.getElementById('lineage-back-btn');
        const graphArea = document.querySelector('.graph-area');
        const graphModeSwitcher = document.getElementById('graph-mode-switcher');

        const viewTitles = {
            lineage: 'Data Lineage',
            tableExplorer: 'Table Explorer',
            impact: 'Impact Analysis'
        };

        const viewEmptyStates = {
            lineage: '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>',
            tableExplorer: '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>',
            impact: '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>'
        };

        function updateSidebarSectionsForView() {
            const show = currentViewMode === 'graph';
            document.querySelectorAll('[data-sidebar-section]').forEach(el => {
                el.style.display = show ? '' : 'none';
            });
        }

        function switchToView(view, skipMessage = false) {
            if (view === currentViewMode) return;

            viewTabs.forEach(t => {
                if (t.getAttribute('data-view') === view) {
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                }
            });
            currentViewMode = view;

            // Show/hide header search box (only relevant for Graph tab)
            const headerSearchBox = document.querySelector('.header-right .search-box');
            if (headerSearchBox) {
                headerSearchBox.style.display = view === 'graph' ? '' : 'none';
            }

            if (view === 'graph') {
                lineagePanel?.classList.remove('visible');
                if (graphArea) graphArea.style.display = '';
                if (focusBtn) focusBtn.style.display = '';
                if (graphModeSwitcher) {
                    // Use visibility (not display) so switcher always reserves space in layout.
                    // This prevents main tabs (Graph|Lineage|Tables|Impact) from shifting position
                    // when switching between tabs, ensuring good UX (mouse stays over clicked tab).
                    graphModeSwitcher.style.visibility = 'visible';
                    graphModeSwitcher.style.pointerEvents = 'auto';
                }
                // Reset zoom and fit graph when switching back to Graph tab.
                // This ensures proper view after returning from other tabs (fixes zoom state persistence bug).
                if (svg && mainGroup && graphData && graphData.nodes && graphData.nodes.length > 0) {
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            fitToScreen();
                        }, 100);
                    });
                }
            } else {
                if (graphArea) graphArea.style.display = 'none';
                if (focusBtn) focusBtn.style.display = 'none';
                if (graphModeSwitcher) {
                    // Hide switcher but keep it in layout (visibility: hidden) so main tabs don't shift.
                    // pointer-events: none prevents clicks when hidden.
                    graphModeSwitcher.style.visibility = 'hidden';
                    graphModeSwitcher.style.pointerEvents = 'none';
                }
                lineagePanel?.classList.add('visible');

                if (lineageTitle) {
                    lineageTitle.textContent = viewTitles[view] || 'Data Lineage';
                }

                if (lineageContent) {
                    lineageContent.innerHTML = viewEmptyStates[view] || '';
                }

                // Only send message if not restoring view (skipMessage = false by default)
                if (!skipMessage) {
                    if (view === 'lineage') {
                        vscode.postMessage({ command: 'switchToLineageView' });
                    } else if (view === 'tableExplorer') {
                        vscode.postMessage({ command: 'switchToTableExplorer' });
                    } else if (view === 'impact') {
                        vscode.postMessage({ command: 'switchToImpactView' });
                    }
                }
            }
            updateSidebarSectionsForView();
        }

        viewTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                const view = tab.getAttribute('data-view');
                switchToView(view);
            });
        });

        /**
         * Graph mode switcher (Files / Tables / Hybrid)
         * Uses event delegation on the switcher container to handle button clicks.
         * This prevents duplicate listeners and ensures buttons work after tab switches.
         * 
         * Fix: If user clicks mode button while on non-Graph tab, switch to Graph first,
         * then change mode. This prevents navigation to wrong tab after mode switch.
         */
        const graphModeSwitcherContainer = document.getElementById('graph-mode-switcher');
        if (graphModeSwitcherContainer) {
            // Use event delegation - attach listener once to the container
            graphModeSwitcherContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.graph-mode-btn');
                if (!btn) return;
                
                e.stopPropagation();
                e.preventDefault();
                
                // Ensure we're on Graph tab - if not, switch to it first
                if (currentViewMode !== 'graph') {
                    switchToView('graph', false);
                    // After switching to Graph, trigger the mode change
                    setTimeout(() => {
                        const mode = btn.getAttribute('data-mode');
                        if (mode && mode !== currentGraphMode) {
                            currentGraphMode = mode;
                            vscode.postMessage({ command: 'switchGraphMode', mode });
                        }
                    }, 100);
                    return;
                }
                
                const mode = btn.getAttribute('data-mode');
                // Don't do anything if clicking the already-active mode (prevents bug where it navigated to Lineage)
                if (mode && mode !== currentGraphMode) {
                    currentGraphMode = mode;
                    vscode.postMessage({ command: 'switchGraphMode', mode });
                }
            });
        }

        updateSidebarSectionsForView();

        // Graph mode help tooltip
        const helpBtn = document.getElementById('graph-mode-help-btn');
        const helpTooltip = document.getElementById('graph-mode-help-tooltip');
        if (helpBtn && helpTooltip) {
            helpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = helpTooltip.classList.contains('visible');
                if (!isVisible) {
                    const rect = helpBtn.getBoundingClientRect();
                    helpTooltip.style.top = (rect.bottom + 8) + 'px';
                    helpTooltip.style.right = (window.innerWidth - rect.right) + 'px';
                }
                helpTooltip.classList.toggle('visible');
            });
            document.addEventListener('click', (e) => {
                if (!helpBtn.contains(e.target) && !helpTooltip.contains(e.target)) {
                    helpTooltip.classList.remove('visible');
                }
            });
        }

        // Set initial graph-mode-switcher visibility (always in layout; visibility reserves space).
        // This ensures main tabs are in the same position on initial load regardless of active tab.
        if (graphModeSwitcher) {
            if (currentViewMode === 'graph') {
                graphModeSwitcher.style.visibility = 'visible';
                graphModeSwitcher.style.pointerEvents = 'auto';
            } else {
                graphModeSwitcher.style.visibility = 'hidden';
                graphModeSwitcher.style.pointerEvents = 'none';
            }
        }
        if (focusBtn) {
            focusBtn.style.display = currentViewMode === 'graph' ? '' : 'none';
        }

        // Restore initial view if not graph (e.g., after theme change)
        if (typeof initialViewMode !== 'undefined' && initialViewMode !== 'graph') {
            // Use setTimeout to ensure DOM is ready and to avoid blocking
            setTimeout(() => {
                switchToView(initialViewMode, true);
                // Re-request the view content from server
                if (initialViewMode === 'lineage') {
                    vscode.postMessage({ command: 'switchToLineageView' });
                } else if (initialViewMode === 'tableExplorer') {
                    vscode.postMessage({ command: 'switchToTableExplorer' });
                } else if (initialViewMode === 'impact') {
                    vscode.postMessage({ command: 'switchToImpactView' });
                }
            }, 0);
        }

        function updateBackButtonText() {
            if (!lineageBackBtn) return;
            if (lineageDetailView && currentViewMode !== 'graph') {
                const tabNames = { lineage: 'Lineage', tableExplorer: 'Tables', impact: 'Impact' };
                lineageBackBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to ' + (tabNames[currentViewMode] || 'Overview');
            } else {
                lineageBackBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to Graph';
            }
        }

        lineageBackBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lineageDetailView && currentViewMode !== 'graph') {
                // Check if we have history to go back to (for table explorer)
                if (currentViewMode === 'tableExplorer' && tableExplorerHistory.length > 0) {
                    const prev = tableExplorerHistory.pop();
                    if (lineageTitle) lineageTitle.textContent = 'Table: ' + prev.tableName;
                    lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';
                    vscode.postMessage({ command: 'exploreTable', tableName: prev.tableName, nodeId: prev.nodeId });
                    updateBackButtonText();
                } else {
                    // No history, go back to main view
                    lineageDetailView = false;
                    tableExplorerHistory = [];
                    currentExploredTable = null;
                    updateBackButtonText();
                    if (currentViewMode === 'lineage') {
                        if (lineageTitle) lineageTitle.textContent = 'Data Lineage';
                        vscode.postMessage({ command: 'switchToLineageView' });
                    } else if (currentViewMode === 'tableExplorer') {
                        if (lineageTitle) lineageTitle.textContent = 'Table Explorer';
                        vscode.postMessage({ command: 'switchToTableExplorer' });
                    } else if (currentViewMode === 'impact') {
                        if (lineageTitle) lineageTitle.textContent = 'Impact Analysis';
                        vscode.postMessage({ command: 'switchToImpactView' });
                    }
                }
            } else {
                switchToView('graph');
            }
        });
    `;
}

function getContextMenuScript(): string {
    return `
        // ========== Context Menu ==========
        const contextMenu = document.getElementById('context-menu');
        let contextMenuTarget = null;

        function showContextMenu(e, nodeData) {
            e.preventDefault();
            contextMenuTarget = nodeData;

            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = e.clientY + 'px';
            contextMenu.classList.add('visible');

            /**
             * Dynamically show/hide context menu items based on graph mode and node type.
             * This ensures users only see relevant options for the current context.
             */
            const graphMode = typeof currentGraphMode !== 'undefined' ? currentGraphMode : 'tables';
            const isFileNode = nodeData.type === 'file';
            const isTableNode = nodeData.type === 'table' || nodeData.type === 'view' || nodeData.type === 'external';

            const upstreamItem = contextMenu.querySelector('[data-action="showUpstream"]');
            const downstreamItem = contextMenu.querySelector('[data-action="showDownstream"]');
            const openFileItem = contextMenu.querySelector('[data-action="openFile"]');
            const visualizeItem = contextMenu.querySelector('[data-action="visualize"]');

            // In Files mode, hide upstream/downstream for file nodes (graph already shows file dependencies)
            // In Tables/Hybrid mode, show upstream/downstream for table nodes
            if (upstreamItem && downstreamItem) {
                if (graphMode === 'files' && isFileNode) {
                    upstreamItem.style.display = 'none';
                    downstreamItem.style.display = 'none';
                } else {
                    upstreamItem.style.display = '';
                    downstreamItem.style.display = '';
                }
            }

            // Open File only makes sense for file nodes
            if (openFileItem) {
                openFileItem.style.display = isFileNode ? '' : 'none';
            }

            // Visualize Dependencies only makes sense for file nodes
            if (visualizeItem) {
                visualizeItem.style.display = isFileNode ? '' : 'none';
            }
        }

        function hideContextMenu() {
            contextMenu?.classList.remove('visible');
            contextMenuTarget = null;
        }

        document.addEventListener('click', (e) => {
            if (e.target.closest('.context-menu')) return;
            if (e.target.closest('.view-tabs')) return;
            hideContextMenu();
        });

        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.node')) {
                hideContextMenu();
            }
        });

        contextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!contextMenuTarget || item.classList.contains('disabled') || item.style.display === 'none') return;

                const action = item.getAttribute('data-action');
                const nodeName = contextMenuTarget.label || contextMenuTarget.id;

                switch (action) {
                    case 'showUpstream':
                        switchToView('lineage');
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading upstream dependencies...</div></div>';
                        if (contextMenuTarget.type === 'file') {
                            vscode.postMessage({
                                command: 'getUpstream',
                                nodeType: 'file',
                                filePath: contextMenuTarget.filePath,
                                depth: 5
                            });
                        } else {
                            const nodeType = contextMenuTarget.type === 'external' ? 'external' : contextMenuTarget.type;
                            vscode.postMessage({
                                command: 'getUpstream',
                                nodeId: nodeType + ':' + nodeName.toLowerCase(),
                                depth: 5
                            });
                        }
                        break;
                    case 'showDownstream':
                        switchToView('lineage');
                        if (lineageTitle) lineageTitle.textContent = 'Downstream of ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading downstream dependencies...</div></div>';
                        if (contextMenuTarget.type === 'file') {
                            vscode.postMessage({
                                command: 'getDownstream',
                                nodeType: 'file',
                                filePath: contextMenuTarget.filePath,
                                depth: 5
                            });
                        } else {
                            const nodeType = contextMenuTarget.type === 'external' ? 'external' : contextMenuTarget.type;
                            vscode.postMessage({
                                command: 'getDownstream',
                                nodeId: nodeType + ':' + nodeName.toLowerCase(),
                                depth: 5
                            });
                        }
                        break;
                    case 'analyzeImpact':
                        switchToView('impact');
                        if (lineageTitle) lineageTitle.textContent = 'Impact Analysis: ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Analyzing impact...</div></div>';
                        vscode.postMessage({
                            command: 'analyzeImpact',
                            type: 'table',
                            name: nodeName,
                            changeType: 'modify'
                        });
                        break;
                    case 'exploreTable':
                        switchToView('tableExplorer');
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading table details...</div></div>';
                        vscode.postMessage({
                            command: 'exploreTable',
                            tableName: nodeName
                        });
                        break;
                    case 'openFile':
                        if (contextMenuTarget.filePath) {
                            openFile(contextMenuTarget.filePath);
                        }
                        break;
                    case 'visualize':
                        // Handle "Visualize Dependencies" context menu action
                        // Opens the visualization panel for the selected file node
                        if (contextMenuTarget.filePath) {
                            visualizeFile(contextMenuTarget.filePath);
                        }
                        break;
                }
                hideContextMenu();
            });
        });
    `;
}

function getMessageHandlingScript(): string {
    return `
        // ========== Message Handling from Extension ==========
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'lineageResult':
                case 'upstreamResult':
                case 'downstreamResult':
                    if (lineageContent && message.data) {
                        const nodes = message.data.nodes || message.data.result?.nodes || [];
                        let html = '<h2>' + (message.command === 'upstreamResult' ? 'Upstream' : message.command === 'downstreamResult' ? 'Downstream' : 'Lineage') + ' Analysis</h2>';
                        html += '<p style="color: var(--text-muted); margin-bottom: 16px;">Found ' + nodes.length + ' related nodes</p>';
                        html += '<div style="display: grid; gap: 8px;">';
                        nodes.forEach(n => {
                            html += '<div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; cursor: pointer;" onclick="vscode.postMessage({command:\\'openFileAtLine\\', filePath:\\'' + (n.filePath || '').replace(/'/g, "\\\\'") + '\\', line: ' + (n.lineNumber || 0) + '})">';
                            html += '<div style="font-weight: 600; color: var(--text-primary);">' + n.name + '</div>';
                            html += '<div style="font-size: 11px; color: var(--text-muted);">' + n.type + (n.filePath ? ' • ' + n.filePath.split('/').pop() : '') + '</div>';
                            html += '</div>';
                        });
                        html += '</div>';
                        lineageContent.innerHTML = html;
                    }
                    break;
                case 'impactResult':
                    if (lineageContent && message.data?.html) {
                        const resultsDiv = document.getElementById('impact-results');
                        if (resultsDiv) {
                            resultsDiv.style.display = 'block';
                            resultsDiv.innerHTML = message.data.html;
                        } else {
                            lineageContent.innerHTML = message.data.html;
                        }
                        setupImpactSummaryDetails();
                    }
                    break;
                case 'tableExplorerResult':
                    if (lineageContent) {
                        if (message.data?.error) {
                            lineageContent.innerHTML = '<div style="color: var(--error); padding: 20px;">' + message.data.error + '</div>';
                        } else if (message.data?.html) {
                            lineageContent.innerHTML = message.data.html;
                        }
                    }
                    break;
                case 'columnLineageResult':
                    handleColumnLineageResult(message.data);
                    break;
                case 'columnSelectionCleared':
                    clearColumnHighlighting();
                    break;
                case 'tableListResult':
                    if (lineageContent && message.data?.html) {
                        lineageContent.innerHTML = message.data.html;
                        setupTableSearchAndFilter();
                    }
                    break;
                case 'impactFormResult':
                    if (lineageContent && message.data?.html) {
                        lineageContent.innerHTML = message.data.html;
                        setupImpactForm();
                    }
                    break;
                case 'lineageOverviewResult':
                    if (lineageContent && message.data?.html) {
                        lineageContent.innerHTML = message.data.html;
                        setupVisualLineageSearch();
                    }
                    break;
                case 'lineageSearchResults':
                    if (message.data?.results) {
                        showLineageSearchResults(message.data.results);
                    }
                    break;
                case 'lineageGraphResult':
                    if (lineageSetupInProgress) {
                        break;
                    }
                    if (lineageContent && message.data?.html) {
                        lineageSetupInProgress = true;
                        lineageContent.innerHTML = message.data.html;
                        lineageDetailView = true;
                        if (message.data.nodeId) {
                            lineageCurrentNodeId = message.data.nodeId;
                        }
                        if (message.data.direction) {
                            lineageCurrentDirection = message.data.direction;
                        }
                        if (message.data.expandedNodes) {
                            lineageExpandedNodes = new Set(message.data.expandedNodes);
                        }
                        updateBackButtonText();
                        setupLineageGraphInteractions();
                        setupDirectionButtons();
                        setTimeout(() => { lineageSetupInProgress = false; }, 200);
                    }
                    break;
                case 'nodeColumnsResult':
                    if (message.data?.nodeId) {
                        expandNodeWithColumns(message.data.nodeId);
                    }
                    break;
                case 'nodeCollapsedResult':
                    if (message.data?.nodeId) {
                        collapseNodeWithColumns(message.data.nodeId);
                    }
                    break;
                case 'exportPng':
                    // Handle PNG export request from extension
                    exportToPng();
                    break;
            }
        });

        // ========== PNG Export Function ==========
        function exportToPng() {
            const svgElement = document.getElementById('graph-svg');
            if (!svgElement) {
                vscode.postMessage({ command: 'exportPngError', error: 'No SVG element found' });
                return;
            }

            try {
                // Clone SVG to avoid modifying the original
                const svgClone = svgElement.cloneNode(true);
                
                // Get computed styles and dimensions
                const bbox = mainGroup ? mainGroup.getBBox() : { x: 0, y: 0, width: 1200, height: 800 };
                const padding = 50;
                const width = Math.max(1200, bbox.width + padding * 2);
                const height = Math.max(800, bbox.height + padding * 2);

                // Set proper dimensions on clone
                svgClone.setAttribute('width', width);
                svgClone.setAttribute('height', height);
                svgClone.setAttribute('viewBox', (bbox.x - padding) + ' ' + (bbox.y - padding) + ' ' + width + ' ' + height);

                // Reset transform on main-group for export
                const cloneMainGroup = svgClone.getElementById('main-group');
                if (cloneMainGroup) {
                    cloneMainGroup.setAttribute('transform', 'translate(0,0) scale(1)');
                }

                // Add background
                const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bgRect.setAttribute('x', bbox.x - padding);
                bgRect.setAttribute('y', bbox.y - padding);
                bgRect.setAttribute('width', width);
                bgRect.setAttribute('height', height);
                bgRect.setAttribute('fill', document.body.classList.contains('dark') ? '#0f172a' : '#ffffff');
                svgClone.insertBefore(bgRect, svgClone.firstChild);

                // Serialize SVG
                const svgData = new XMLSerializer().serializeToString(svgClone);
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const svgUrl = URL.createObjectURL(svgBlob);

                // Create canvas and draw
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const scale = 2; // 2x for retina quality
                canvas.width = width * scale;
                canvas.height = height * scale;
                ctx.scale(scale, scale);

                const img = new Image();
                img.onload = function() {
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(svgUrl);

                    // Convert to PNG and send to extension
                    const pngDataUrl = canvas.toDataURL('image/png');
                    const base64Data = pngDataUrl.split(',')[1];

                    vscode.postMessage({
                        command: 'savePng',
                        data: base64Data,
                        filename: 'workspace-dependencies-' + Date.now() + '.png'
                    });
                };

                img.onerror = function(e) {
                    URL.revokeObjectURL(svgUrl);
                    vscode.postMessage({ command: 'exportPngError', error: 'Failed to load SVG for PNG conversion' });
                };

                img.src = svgUrl;
            } catch (e) {
                vscode.postMessage({ command: 'exportPngError', error: 'PNG export failed: ' + e.message });
            }
        }
    `;
}

function getEventDelegationScript(): string {
    return `
        // ========== Event Delegation for Dynamic Lineage Content ==========
        if (lineageContent) {
            lineageContent.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;

                const action = target.getAttribute('data-action');
                const tableName = target.getAttribute('data-table');
                const nodeId = target.getAttribute('data-node-id');

                if (!tableName) return;

                lineageDetailView = true;
                updateBackButtonText();

                switch (action) {
                    case 'explore-table':
                        // Push current table to history before navigating (for back button)
                        if (currentViewMode === 'tableExplorer' && currentExploredTable) {
                            tableExplorerHistory.push(currentExploredTable);
                        }
                        currentExploredTable = { tableName: tableName, nodeId: nodeId };
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + tableName;
                        lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';
                        // Send nodeId if available (for views/CTEs), fallback to tableName for backward compat
                        vscode.postMessage({ command: 'exploreTable', tableName: tableName, nodeId: nodeId });
                        break;
                    case 'show-upstream':
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + tableName;
                        lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';
                        vscode.postMessage({ command: 'getUpstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: 5 });
                        break;
                    case 'show-downstream':
                        if (lineageTitle) lineageTitle.textContent = 'Downstream of ' + tableName;
                        lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';
                        vscode.postMessage({ command: 'getDownstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: 5 });
                        break;
                }
            });
        }
    `;
}

function getNodeInteractionsScript(): string {
    return `
        // ========== Node Interactions ==========
        if (svg) {
            var nodeClickTimeout = null;
            
            svg.addEventListener('click', (e) => {
                var node = e.target.closest('.node');
                if (!node) return;

                updateSelectionPanel(node);

                var filePath = node.getAttribute('data-filepath');
                if (!filePath) return;
                
                // Delay single-click so double-click can cancel it
                nodeClickTimeout = window.setTimeout(function() {
                    openFile(filePath);
                    nodeClickTimeout = null;
                }, 300);
            });

            svg.addEventListener('dblclick', (e) => {
                var node = e.target.closest('.node');
                if (!node) return;
                
                if (nodeClickTimeout) {
                    clearTimeout(nodeClickTimeout);
                    nodeClickTimeout = null;
                }
                
                var filePath = node.getAttribute('data-filepath');
                if (filePath) {
                    e.preventDefault();
                    e.stopPropagation();
                    visualizeFile(filePath);
                }
            });

            svg.addEventListener('mouseover', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const base64 = node.getAttribute('data-tooltip');
                    if (base64) {
                        const content = atob(base64);
                        showTooltip(e, content);
                    }
                }
            });

            svg.addEventListener('mouseout', (e) => {
                const node = e.target.closest('.node');
                if (node) hideTooltip();
            });

            svg.addEventListener('contextmenu', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const nodeId = node.getAttribute('data-id');
                    const nodeLabel = node.getAttribute('data-label') || nodeId;
                    const nodeType = node.getAttribute('data-type') || 'file';
                    const filePath = node.getAttribute('data-filepath');

                    updateSelectionPanel(node);
                    showContextMenu(e, {
                        id: nodeId,
                        label: nodeLabel,
                        type: nodeType,
                        filePath: filePath
                    });
                }
            });

            // Edge click-to-highlight functionality:
            // - Click an edge to highlight it (opacity 1, stroke-width 3) and dim all others (opacity 0.2)
            // - Click on empty graph area, double-click anywhere, or click outside graph to clear highlight
            function clearEdgeHighlight() {
                var edges = document.querySelectorAll('.edge');
                edges.forEach(function(el) {
                    el.classList.remove('edge-highlighted', 'edge-dimmed');
                    var path = el.querySelector('path');
                    if (path) {
                        path.style.opacity = '0.7';
                        path.style.strokeWidth = '2';
                    }
                });
            }

            svg.addEventListener('click', (e) => {
                var edge = e.target.closest('.edge');
                if (edge) {
                    e.stopPropagation();
                    clearEdgeHighlight();
                    edge.classList.add('edge-highlighted');
                    var path = edge.querySelector('path');
                    if (path) {
                        path.style.opacity = '1';
                        path.style.strokeWidth = '3';
                    }
                    var all = document.querySelectorAll('.edge');
                    all.forEach(function(el) {
                        if (el !== edge) {
                            el.classList.add('edge-dimmed');
                            var p = el.querySelector('path');
                            if (p) p.style.opacity = '0.2';
                        }
                    });
                    return;
                }
                if (e.target === svg || !e.target.closest('.node')) {
                    clearEdgeHighlight();
                }
            });

            svg.addEventListener('dblclick', (e) => {
                clearEdgeHighlight();
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.graph-area')) clearEdgeHighlight();
            });
        }
    `;
}

function getTooltipScript(): string {
    return `
        // ========== Tooltip Functions ==========
        function showTooltip(e, content) {
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY + 12) + 'px';
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }
    `;
}

function getImpactFormScript(): string {
    return `
        // ========== Impact Form Setup ==========
        function setupImpactForm() {
            const tableSelect = document.getElementById('impact-table-select');
            const analyzeBtn = document.getElementById('impact-analyze-btn');
            const changeTypeButtons = document.querySelectorAll('.change-type-btn');
            const searchInput = document.getElementById('impact-search-input');
            const searchClear = document.getElementById('impact-search-clear');
            const filterChips = document.querySelectorAll('.view-filter-chip[data-filter]');
            const resultsInfo = document.getElementById('impact-results-info');
            const resultsCount = document.getElementById('impact-results-count');

            // Store all original options
            const allOptions = tableSelect ? Array.from(tableSelect.options) : [];

            changeTypeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    changeTypeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });

            // Filter function for search and filter chips
            function filterImpactOptions() {
                if (!tableSelect) return;

                const searchQuery = (searchInput?.value || '').toLowerCase().trim();
                const activeFilter = document.querySelector('.view-filter-chip.active[data-filter]');
                const filterValue = activeFilter?.getAttribute('data-filter') || 'all';

                // Clear existing options except the first (placeholder)
                while (tableSelect.options.length > 1) {
                    tableSelect.remove(1);
                }

                let visibleCount = 0;
                allOptions.forEach((option, index) => {
                    if (index === 0) return; // Skip placeholder

                    const tableName = option.getAttribute('data-name') || '';
                    const tableType = option.getAttribute('data-type') || '';
                    const nameLower = tableName.toLowerCase();

                    const matchesSearch = !searchQuery || nameLower.includes(searchQuery);
                    const matchesFilter = filterValue === 'all' || tableType === filterValue;

                    if (matchesSearch && matchesFilter) {
                        tableSelect.appendChild(option.cloneNode(true));
                        visibleCount++;
                    }
                });

                // Update results info
                if (resultsInfo && resultsCount) {
                    if (searchQuery || filterValue !== 'all') {
                        resultsInfo.style.display = 'block';
                        resultsCount.textContent = visibleCount;
                    } else {
                        resultsInfo.style.display = 'none';
                    }
                }

                // Show/hide clear button
                if (searchClear) {
                    searchClear.style.display = searchQuery ? 'flex' : 'none';
                }

                // Update analyze button state
                if (analyzeBtn) {
                    analyzeBtn.disabled = !tableSelect.value;
                }
            }

            // Search input handler
            if (searchInput) {
                let debounceTimeout;
                searchInput.addEventListener('input', () => {
                    clearTimeout(debounceTimeout);
                    debounceTimeout = setTimeout(filterImpactOptions, 200);
                });
            }

            // Clear search button
            if (searchClear) {
                searchClear.addEventListener('click', () => {
                    if (searchInput) {
                        searchInput.value = '';
                        filterImpactOptions();
                    }
                });
            }

            // Filter chip handlers
            filterChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    filterChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    filterImpactOptions();
                });
            });

            if (tableSelect && analyzeBtn) {
                tableSelect.addEventListener('change', () => {
                    analyzeBtn.disabled = !tableSelect.value;
                });

                analyzeBtn.addEventListener('click', () => {
                    const selectedOption = tableSelect.options[tableSelect.selectedIndex];
                    const tableName = selectedOption.getAttribute('data-name');
                    const tableType = selectedOption.getAttribute('data-type');
                    const activeButton = document.querySelector('.change-type-btn.active');
                    const changeType = activeButton?.getAttribute('data-value') || 'modify';

                    if (!tableName) return;

                    const resultsDiv = document.getElementById('impact-results');
                    if (resultsDiv) {
                        resultsDiv.style.display = 'block';
                        resultsDiv.innerHTML = '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>';
                    }

                    vscode.postMessage({
                        command: 'analyzeImpact',
                        type: 'table',
                        name: tableName,
                        changeType: changeType
                    });
                });
            }

            // Initial filter
            filterImpactOptions();
        }
    `;
}

function getImpactSummaryScript(): string {
    return `
        function setupImpactSummaryDetails() {
            const details = document.getElementById('impact-summary-details');
            const titleEl = document.getElementById('impact-summary-title');
            const listEl = document.getElementById('impact-summary-list');
            const closeBtn = document.getElementById('impact-summary-close');
            if (!details || !titleEl || !listEl) {
                return;
            }

            function escapeHtml(text) {
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            closeBtn?.addEventListener('click', () => {
                details.style.display = 'none';
            });

            document.querySelectorAll('.impact-summary-trigger').forEach(button => {
                button.addEventListener('click', () => {
                    const title = button.getAttribute('data-title') || 'Details';
                    const listRaw = button.getAttribute('data-list') || '[]';
                    let items = [];
                    try {
                        items = JSON.parse(decodeURIComponent(listRaw));
                    } catch {
                        items = [];
                    }

                    titleEl.textContent = title;
                    if (!items.length) {
                        listEl.innerHTML = '<div class="summary-item">No items found</div>';
                    } else {
                        listEl.innerHTML = items.map(item => {
                            const label = escapeHtml(item.label || '');
                            const titleAttr = escapeHtml(item.title || '');
                            return '<div class="summary-item" title="' + titleAttr + '">' + label + '</div>';
                        }).join('');
                    }

                    details.style.display = 'block';
                    details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            });
        }
    `;
}

function getTableSearchScript(): string {
    return `
        // ========== Table Search and Filter Setup ==========
        function setupTableSearchAndFilter() {
            const searchInput = document.getElementById('table-search-input');
            const searchClear = document.getElementById('table-search-clear');
            const typeFilter = document.getElementById('table-type-filter');
            const sortSelect = document.getElementById('table-sort');
            const clearFilters = document.getElementById('table-clear-filters');
            const tableGrid = document.getElementById('table-list-grid');
            const emptyFilter = document.getElementById('table-list-empty-filter');
            const resultsInfo = document.getElementById('table-list-results-info');
            const resultsCount = document.getElementById('table-results-count');
            const emptyMessage = document.getElementById('empty-filter-message');

            let debounceTimeout;
            const totalItems = tableGrid ? tableGrid.querySelectorAll('.table-list-item').length : 0;

            function filterTables() {
                if (!tableGrid) return;

                const searchQuery = (searchInput?.value || '').toLowerCase().trim();
                const typeValue = typeFilter?.value || 'all';
                const sortValue = sortSelect?.value || 'connected';

                const items = Array.from(tableGrid.querySelectorAll('.table-list-item'));
                let visibleItems = [];

                items.forEach(item => {
                    const tableName = item.getAttribute('data-name') || '';
                    const tableType = item.getAttribute('data-type') || '';
                    const nameText = item.querySelector('.table-list-name')?.textContent?.toLowerCase() || '';

                    const matchesSearch = !searchQuery || tableName.includes(searchQuery) || nameText.includes(searchQuery);
                    const matchesType = typeValue === 'all' || tableType === typeValue;

                    if (matchesSearch && matchesType) {
                        item.style.display = '';
                        visibleItems.push(item);
                    } else {
                        item.style.display = 'none';
                    }
                });

                visibleItems.sort((a, b) => {
                    if (sortValue === 'name-asc') {
                        const nameA = a.querySelector('.table-list-name')?.textContent || '';
                        const nameB = b.querySelector('.table-list-name')?.textContent || '';
                        return nameA.localeCompare(nameB);
                    } else if (sortValue === 'name-desc') {
                        const nameA = a.querySelector('.table-list-name')?.textContent || '';
                        const nameB = b.querySelector('.table-list-name')?.textContent || '';
                        return nameB.localeCompare(nameA);
                    } else if (sortValue === 'type') {
                        const typeA = a.getAttribute('data-type') || '';
                        const typeB = b.getAttribute('data-type') || '';
                        if (typeA !== typeB) return typeA.localeCompare(typeB);
                        const nameA = a.querySelector('.table-list-name')?.textContent || '';
                        const nameB = b.querySelector('.table-list-name')?.textContent || '';
                        return nameA.localeCompare(nameB);
                    } else {
                        return 0;
                    }
                });

                visibleItems.forEach(item => tableGrid.appendChild(item));

                if (searchQuery && visibleItems.length > 0) {
                    visibleItems.forEach(item => {
                        const nameEl = item.querySelector('.table-list-name');
                        if (nameEl) {
                            const text = nameEl.textContent || '';
                            let escapedQuery = '';
                            const specialChars = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\\\\\\\'];
                            for (let i = 0; i < searchQuery.length; i++) {
                                const char = searchQuery[i];
                                if (specialChars.indexOf(char) >= 0) {
                                    escapedQuery += '\\\\\\\\' + char;
                                } else {
                                    escapedQuery += char;
                                }
                            }
                            const regex = new RegExp('(' + escapedQuery + ')', 'gi');
                            nameEl.innerHTML = text.replace(regex, '<mark>$1</mark>');
                        }
                    });
                } else {
                    items.forEach(item => {
                        const nameEl = item.querySelector('.table-list-name');
                        if (nameEl) {
                            nameEl.innerHTML = nameEl.textContent || '';
                        }
                    });
                }

                if (resultsInfo && resultsCount) {
                    resultsInfo.style.display = 'block';
                    resultsCount.textContent = 'Showing ' + visibleItems.length + ' of ' + totalItems + ' tables';
                }

                if (emptyFilter && emptyMessage) {
                    if (visibleItems.length === 0) {
                        emptyFilter.style.display = 'block';
                        let message = 'No tables match your search criteria';
                        if (searchQuery) {
                            message = 'No tables matching "' + searchQuery + '"';
                        } else if (typeValue !== 'all') {
                            message = 'No ' + typeValue + 's found';
                        }
                        emptyMessage.textContent = message;
                    } else {
                        emptyFilter.style.display = 'none';
                    }
                }

                if (searchClear) {
                    searchClear.style.display = searchQuery || typeValue !== 'all' ? 'flex' : 'none';
                }
                if (clearFilters) {
                    clearFilters.style.display = searchQuery || typeValue !== 'all' ? 'inline-flex' : 'none';
                }
            }

            function debouncedFilter() {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(filterTables, 180);
            }

            searchInput?.addEventListener('input', debouncedFilter);
            searchClear?.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (typeFilter) typeFilter.value = 'all';
                filterTables();
                searchInput?.focus();
            });
            clearFilters?.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (typeFilter) typeFilter.value = 'all';
                if (sortSelect) sortSelect.value = 'connected';
                filterTables();
                searchInput?.focus();
            });
            typeFilter?.addEventListener('change', filterTables);
            sortSelect?.addEventListener('change', filterTables);

            searchInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (searchInput.value) {
                        searchInput.value = '';
                        filterTables();
                    } else {
                        searchInput.blur();
                    }
                    e.preventDefault();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                if (e.key === '/' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    searchInput?.focus();
                    searchInput?.select();
                }
            });

            filterTables();
        }
    `;
}

function getVisualLineageSearchScript(): string {
    return `
        // ========== Visual Lineage Search Setup ==========
        let lineageTypeFilter = 'all';

        function setupVisualLineageSearch() {
            const searchInput = document.getElementById('lineage-search-input');
            const searchClear = document.getElementById('lineage-search-clear');
            const filterChips = document.querySelectorAll('.view-quick-filters .view-filter-chip');
            const tablesGrid = document.getElementById('lineage-tables-grid');
            const emptyFilter = document.getElementById('lineage-empty-filter');
            const resultsInfo = document.getElementById('lineage-results-info');
            const resultsCount = document.getElementById('lineage-results-count');

            function filterLineageTables() {
                if (!tablesGrid) return;

                const searchQuery = (searchInput?.value || '').toLowerCase().trim();
                const items = Array.from(tablesGrid.querySelectorAll('.lineage-table-item'));
                let visibleCount = 0;

                items.forEach(item => {
                    const name = item.getAttribute('data-name') || '';
                    const type = item.getAttribute('data-type') || '';

                    const matchesSearch = !searchQuery || name.includes(searchQuery);
                    const matchesType = lineageTypeFilter === 'all' || type === lineageTypeFilter;

                    if (matchesSearch && matchesType) {
                        item.style.display = '';
                        visibleCount++;

                        // Highlight matching text
                        const nameEl = item.querySelector('.table-item-name');
                        if (nameEl && searchQuery) {
                            const originalName = nameEl.textContent || '';
                            const lowerName = originalName.toLowerCase();
                            const idx = lowerName.indexOf(searchQuery);
                            if (idx >= 0) {
                                const before = originalName.slice(0, idx);
                                const match = originalName.slice(idx, idx + searchQuery.length);
                                const after = originalName.slice(idx + searchQuery.length);
                                nameEl.innerHTML = escapeHtml(before) + '<mark>' + escapeHtml(match) + '</mark>' + escapeHtml(after);
                            } else {
                                nameEl.textContent = originalName;
                            }
                        } else if (nameEl) {
                            // Remove highlighting when no search
                            const text = nameEl.textContent || '';
                            nameEl.textContent = text;
                        }
                    } else {
                        item.style.display = 'none';
                    }
                });

                // Show/hide empty state and results count
                if (emptyFilter) {
                    emptyFilter.style.display = visibleCount === 0 ? 'block' : 'none';
                }
                if (resultsInfo && resultsCount) {
                    if (searchQuery || lineageTypeFilter !== 'all') {
                        resultsInfo.style.display = 'inline';
                        resultsCount.textContent = visibleCount;
                    } else {
                        resultsInfo.style.display = 'none';
                    }
                }
            }

            searchInput?.addEventListener('input', () => {
                const query = searchInput.value.trim();
                if (searchClear) searchClear.style.display = query ? 'flex' : 'none';
                filterLineageTables();
            });

            searchInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    if (searchClear) searchClear.style.display = 'none';
                    filterLineageTables();
                    searchInput.blur();
                } else if (e.key === 'Enter') {
                    // Select the first visible item
                    const firstVisible = tablesGrid?.querySelector('.lineage-table-item:not([style*="display: none"])');
                    if (firstVisible) {
                        firstVisible.click();
                    }
                }
            });

            searchClear?.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (searchClear) searchClear.style.display = 'none';
                filterLineageTables();
                searchInput?.focus();
            });

            filterChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    filterChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    lineageTypeFilter = chip.getAttribute('data-filter') || 'all';
                    filterLineageTables();
                });
            });

            // Setup click handlers for table items
            tablesGrid?.querySelectorAll('.lineage-table-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                    }
                });
            });
        }

        function selectLineageNode(nodeId) {
            if (lineageContent) {
                lineageContent.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 300px;"><div class="skeleton-loader" style="width: 200px;"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>';
            }
            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: nodeId,
                depth: 5,
                direction: 'both'
            });
        }
    `;
}

function getLineageGraphScript(): string {
    return `
        // ========== Visual Lineage Graph Interactions ==========
        let lineageScale = 1;
        let lineageOffsetX = 50;
        let lineageOffsetY = 50;
        let lineageIsDragging = false;
        let lineageDragStartX = 0;
        let lineageDragStartY = 0;
        let lineageFocusedNode = null;
        let lineageExpandedNodes = new Set();
        let lineageCurrentNodeId = null;
        let lineageCurrentDirection = 'both';
        let lineageAutoFitNodeId = null;
        let lineageSetupInProgress = false;

        function setupLineageGraphInteractions() {
            const container = document.getElementById('lineage-graph-container');
            const svg = container?.querySelector('.lineage-graph-svg');
            const graphContainer = svg?.querySelector('.lineage-graph-container');
            const tooltip = document.getElementById('lineage-tooltip');
            const contextMenu = document.getElementById('lineage-context-menu');
            const zoomInBtn = document.getElementById('lineage-zoom-in');
            const zoomOutBtn = document.getElementById('lineage-zoom-out');
            const zoomFitBtn = document.getElementById('lineage-zoom-fit');
            const zoomResetBtn = document.getElementById('lineage-zoom-reset');
            const zoomLevel = document.getElementById('lineage-zoom-level');
            const directionBtns = document.querySelectorAll('.direction-btn');

            lineageScale = 1;
            lineageOffsetX = 0;
            lineageOffsetY = 0;

            function updateLineageTransform() {
                const currentGraphContainer = document.querySelector('#lineage-graph-container .lineage-graph-svg .lineage-graph-container');
                const currentZoomLevel = document.getElementById('lineage-zoom-level');
                if (!currentGraphContainer) return;
                currentGraphContainer.setAttribute('transform', 'translate(' + lineageOffsetX + ',' + lineageOffsetY + ') scale(' + lineageScale + ')');
                if (currentZoomLevel) {
                    currentZoomLevel.textContent = Math.round(lineageScale * 100) + '%';
                }
            }

            function fitToContainer(isAutoFit = false) {
                if (isAutoFit && lineageAutoFitNodeId === lineageCurrentNodeId && lineageCurrentNodeId !== null) {
                    return;
                }

                const currentContainer = document.getElementById('lineage-graph-container');
                const currentGraphContainer = currentContainer?.querySelector('.lineage-graph-svg .lineage-graph-container');
                if (!currentContainer || !currentGraphContainer) {
                    return;
                }

                const containerRect = currentContainer.getBoundingClientRect();
                const bbox = currentGraphContainer.getBBox();

                if (bbox.width > 0 && bbox.height > 0 && containerRect.width > 0 && containerRect.height > 0) {
                    // Work in pixel coordinates (no viewBox transformation)
                    const padding = 60;
                    const availableWidth = containerRect.width - padding * 2;
                    const availableHeight = containerRect.height - padding * 2;

                    const scaleX = availableWidth / bbox.width;
                    const scaleY = availableHeight / bbox.height;

                    lineageScale = Math.min(scaleX, scaleY);
                    // Cap auto-fit at 100% to prevent zooming in too much for small graphs
                    lineageScale = Math.max(0.3, Math.min(1.0, lineageScale));

                    // Calculate bbox center
                    const bboxCenterX = bbox.x + bbox.width / 2;
                    const bboxCenterY = bbox.y + bbox.height / 2;

                    // Container center
                    const containerCenterX = containerRect.width / 2;
                    const containerCenterY = containerRect.height / 2;

                    // Offset to center the scaled bbox in the container
                    lineageOffsetX = containerCenterX - bboxCenterX * lineageScale;
                    lineageOffsetY = containerCenterY - bboxCenterY * lineageScale;

                    updateLineageTransform();

                    if (isAutoFit && lineageCurrentNodeId) {
                        lineageAutoFitNodeId = lineageCurrentNodeId;
                    }
                }
            }

            zoomInBtn?.addEventListener('click', () => {
                lineageScale = Math.min(3, lineageScale * 1.2);
                updateLineageTransform();
            });

            zoomOutBtn?.addEventListener('click', () => {
                lineageScale = Math.max(0.2, lineageScale / 1.2);
                updateLineageTransform();
            });

            zoomResetBtn?.addEventListener('click', () => {
                fitToContainer();
                if (svg) {
                    const nodes = svg.querySelectorAll('.lineage-node');
                    if (nodes) clearLineageFocus(nodes);
                }
            });

            zoomFitBtn?.addEventListener('click', fitToContainer);

            if (!svg || !graphContainer) return;

            requestAnimationFrame(() => {
                setTimeout(() => fitToContainer(true), 100);
            });

            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                lineageScale = Math.max(0.2, Math.min(3, lineageScale * delta));
                updateLineageTransform();
            });

            svg.addEventListener('mousedown', (e) => {
                if (e.target === svg || e.target.closest('.lineage-edge')) {
                    lineageIsDragging = true;
                    lineageDragStartX = e.clientX - lineageOffsetX;
                    lineageDragStartY = e.clientY - lineageOffsetY;
                    svg.style.cursor = 'grabbing';
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (lineageIsDragging) {
                    lineageOffsetX = e.clientX - lineageDragStartX;
                    lineageOffsetY = e.clientY - lineageDragStartY;
                    updateLineageTransform();
                }
            });

            document.addEventListener('mouseup', () => {
                lineageIsDragging = false;
                if (svg) svg.style.cursor = 'grab';
            });

            const nodes = svg.querySelectorAll('.lineage-node');
            nodes.forEach(node => {
                node.addEventListener('mouseenter', (e) => {
                    showLineageTooltip(e, node);
                });

                node.addEventListener('mouseleave', () => {
                    hideLineageTooltip();
                });

                node.addEventListener('click', (e) => {
                    e.stopPropagation();

                    const actionTarget = e.target.closest('[data-action]');
                    if (actionTarget) {
                        const action = actionTarget.getAttribute('data-action');
                        const nodeId = node.getAttribute('data-node-id');

                        if (action === 'selectColumn') {
                            const columnName = actionTarget.getAttribute('data-column-name');
                            if (nodeId && columnName) {
                                vscode.postMessage({
                                    command: 'selectColumn',
                                    tableId: nodeId,
                                    columnName: columnName
                                });
                            }
                            return;
                        } else if (action === 'expand') {
                            if (nodeId) {
                                vscode.postMessage({
                                    command: 'expandNodeColumns',
                                    nodeId: nodeId
                                });
                            }
                            return;
                        } else if (action === 'collapse') {
                            if (nodeId) {
                                vscode.postMessage({
                                    command: 'collapseNodeColumns',
                                    nodeId: nodeId
                                });
                            }
                            return;
                        }
                    }

                    focusLineageNode(node, nodes);
                });

                node.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    const filePath = node.getAttribute('data-file-path');
                    const lineNumber = parseInt(node.getAttribute('data-line-number') || '0');
                    if (filePath) {
                        vscode.postMessage({ command: 'openFileAtLine', filePath, line: lineNumber });
                    }
                });

                node.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showLineageContextMenu(e, node);
                });
            });

            svg.addEventListener('click', (e) => {
                if (e.target === svg || e.target.classList.contains('lineage-graph-container') ||
                    e.target.closest('.lineage-edge')) {
                    clearLineageFocus(nodes);
                }
            });

            directionBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const direction = btn.getAttribute('data-direction');
                    const nodeId = btn.getAttribute('data-node-id');
                    if (direction && nodeId) {
                        lineageCurrentDirection = direction;
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            direction: direction,
                            depth: 5,
                            expandedNodes: Array.from(lineageExpandedNodes)
                        });
                    }
                });
            });

            document.addEventListener('click', () => {
                if (contextMenu) contextMenu.style.display = 'none';
            });

            setTimeout(() => {
                if (zoomFitBtn) zoomFitBtn.click();
            }, 100);
        }

        function showLineageTooltip(e, node) {
            const tooltip = document.getElementById('lineage-tooltip');
            if (!tooltip) return;

            const name = node.getAttribute('data-node-name') || '';
            const type = node.getAttribute('data-node-type') || '';
            const filePath = node.getAttribute('data-file-path') || '';
            const lineNumber = node.getAttribute('data-line-number') || '';

            const icons = { table: '📊', view: '👁️', cte: '🔄', external: '🌐' };

            tooltip.querySelector('.tooltip-icon').textContent = icons[type] || '📦';
            tooltip.querySelector('.tooltip-name').textContent = name;
            tooltip.querySelector('.type-value').textContent = type;
            tooltip.querySelector('.file-value').textContent = filePath ? filePath.split('/').pop() : 'N/A';
            tooltip.querySelector('.line-value').textContent = lineNumber || 'N/A';
            tooltip.querySelector('.columns-value').textContent = '-';
            tooltip.querySelector('.upstream-value').textContent = '-';
            tooltip.querySelector('.downstream-value').textContent = '-';

            // Position near mouse cursor with boundary checks
            const tooltipWidth = 220;
            const tooltipHeight = 280;
            const padding = 15;
            let left = e.clientX + padding;
            let top = e.clientY + padding;

            // Keep within viewport
            if (left + tooltipWidth > window.innerWidth) {
                left = e.clientX - tooltipWidth - padding;
            }
            if (top + tooltipHeight > window.innerHeight) {
                top = e.clientY - tooltipHeight - padding;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.display = 'block';
        }

        function hideLineageTooltip() {
            const tooltip = document.getElementById('lineage-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        }

        function focusLineageNode(node, allNodes) {
            const nodeId = node.getAttribute('data-node-id');

            if (lineageFocusedNode === nodeId) {
                clearLineageFocus(allNodes);
            } else {
                lineageFocusedNode = nodeId;
                allNodes.forEach(n => {
                    if (n.getAttribute('data-node-id') === nodeId) {
                        n.classList.add('focused');
                        n.classList.remove('highlighted', 'dimmed');
                    } else {
                        n.classList.remove('focused', 'highlighted');
                        n.classList.add('dimmed');
                    }
                });
            }
        }

        function clearLineageFocus(allNodes) {
            if (allNodes) {
                allNodes.forEach(n => n.classList.remove('focused', 'highlighted', 'dimmed'));
            }
            lineageFocusedNode = null;
        }

        function showCopyFeedback(message) {
            const existing = document.getElementById('copy-feedback-toast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.id = 'copy-feedback-toast';
            toast.textContent = message;
            toast.style.cssText = 'position: fixed; top: 60px; right: 20px; background: var(--bg-secondary); color: var(--text-primary); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--accent); font-size: 12px; z-index: 9999; opacity: 0; transition: opacity 0.2s; box-shadow: var(--shadow-md);';
            document.body.appendChild(toast);

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                setTimeout(() => {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 200);
                }, 1500);
            });
        }

        function showLineageContextMenu(e, node) {
            const contextMenu = document.getElementById('lineage-context-menu');
            if (!contextMenu) return;

            const nodeId = node.getAttribute('data-node-id');
            const nodeName = node.getAttribute('data-node-name');
            const filePath = node.getAttribute('data-file-path');

            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = e.clientY + 'px';
            contextMenu.style.display = 'block';

            const handlers = {
                'open-file': () => {
                    if (filePath) {
                        vscode.postMessage({ command: 'openFile', filePath });
                    }
                },
                'focus-upstream': () => {
                    if (nodeId) {
                        vscode.postMessage({ command: 'getLineageGraph', nodeId, direction: 'upstream', depth: 5 });
                    }
                },
                'focus-downstream': () => {
                    if (nodeId) {
                        vscode.postMessage({ command: 'getLineageGraph', nodeId, direction: 'downstream', depth: 5 });
                    }
                },
                'expand-columns': () => {
                    if (nodeId) {
                        vscode.postMessage({ command: 'expandNodeColumns', nodeId });
                    }
                },
                'copy-name': () => {
                    if (nodeName) {
                        navigator.clipboard.writeText(nodeName).then(() => {
                            showCopyFeedback('Copied!');
                        }).catch(() => {
                            showCopyFeedback('Copy failed');
                        });
                    }
                }
            };

            contextMenu.querySelectorAll('.context-item').forEach(item => {
                const action = item.getAttribute('data-action');
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (handlers[action]) handlers[action]();
                    contextMenu.style.display = 'none';
                };
            });
        }

        function expandNodeWithColumns(nodeId) {
            if (!lineageCurrentNodeId) {
                return;
            }

            if (!lineageExpandedNodes) {
                lineageExpandedNodes = new Set();
            }
            lineageExpandedNodes.add(nodeId);

            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: 5,
                direction: lineageCurrentDirection,
                expandedNodes: Array.from(lineageExpandedNodes)
            });
        }

        function collapseNodeWithColumns(nodeId) {
            if (!lineageCurrentNodeId) {
                return;
            }

            if (lineageExpandedNodes) {
                lineageExpandedNodes.delete(nodeId);
            }

            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: 5,
                direction: lineageCurrentDirection,
                expandedNodes: Array.from(lineageExpandedNodes || new Set())
            });
        }

        // Toggle all column expansions (keyboard shortcut 'C')
        function toggleAllColumns() {
            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg) return;

            const anyExpanded = lineageExpandedNodes && lineageExpandedNodes.size > 0;

            if (anyExpanded) {
                collapseAllColumns();
            } else {
                expandAllColumns();
            }
        }

        // Expand all visible nodes
        function expandAllColumns() {
            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg || !lineageCurrentNodeId) return;

            const nodes = svg.querySelectorAll('.lineage-node');
            nodes.forEach(node => {
                const nodeId = node.getAttribute('data-node-id');
                if (nodeId) {
                    lineageExpandedNodes.add(nodeId);
                }
            });

            // Re-render with all nodes expanded
            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: 5,
                direction: lineageCurrentDirection,
                expandedNodes: Array.from(lineageExpandedNodes)
            });
        }

        // Collapse all nodes
        function collapseAllColumns() {
            if (!lineageCurrentNodeId) return;

            lineageExpandedNodes.clear();

            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: 5,
                direction: lineageCurrentDirection,
                expandedNodes: []
            });
        }

        // Keyboard handler for 'C' key to toggle all columns
        document.addEventListener('keydown', (e) => {
            // Only respond if lineage graph is visible
            const lineageContainer = document.getElementById('lineage-graph-container');
            if (!lineageContainer || lineageContainer.offsetParent === null) return;

            // Ignore if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                toggleAllColumns();
            }
        });

        // ========== Legend Panel Toggle ==========
        const legendToggle = document.getElementById('legend-toggle');
        const legendPanel = document.getElementById('lineage-legend');
        if (legendToggle && legendPanel) {
            legendToggle.addEventListener('click', () => {
                legendPanel.classList.toggle('collapsed');
            });
        }

        // ========== Mini-map Functionality ==========
        function setupMinimap() {
            const minimap = document.getElementById('lineage-minimap');
            const minimapSvg = document.getElementById('minimap-svg');
            const minimapViewport = document.getElementById('minimap-viewport');
            const minimapContent = document.getElementById('minimap-content');
            const container = document.getElementById('lineage-graph-container');

            if (!minimap || !minimapSvg || !minimapViewport || !container) return;

            let minimapDragging = false;

            // Get graph data for calculations
            const graphDataEl = document.getElementById('lineage-graph-data');
            let graphWidth = 800, graphHeight = 600;
            if (graphDataEl) {
                try {
                    const data = JSON.parse(graphDataEl.textContent || '{}');
                    graphWidth = data.width || 800;
                    graphHeight = data.height || 600;
                } catch (e) {}
            }

            // Update viewport rectangle on the minimap
            function updateMinimapViewport() {
                if (!minimapViewport) return;

                const containerRect = container.getBoundingClientRect();
                const minimapRect = minimapContent.getBoundingClientRect();

                // Calculate the visible area in graph coordinates
                const visibleX = -lineageOffsetX / lineageScale;
                const visibleY = -lineageOffsetY / lineageScale;
                const visibleWidth = containerRect.width / lineageScale;
                const visibleHeight = containerRect.height / lineageScale;

                // Scale to minimap coordinates
                const scaleX = minimapRect.width / graphWidth;
                const scaleY = minimapRect.height / graphHeight;
                const scale = Math.min(scaleX, scaleY);

                minimapViewport.setAttribute('x', String(visibleX));
                minimapViewport.setAttribute('y', String(visibleY));
                minimapViewport.setAttribute('width', String(visibleWidth));
                minimapViewport.setAttribute('height', String(visibleHeight));
            }

            // Handle click on minimap to pan
            minimapContent.addEventListener('mousedown', (e) => {
                e.preventDefault();
                minimapDragging = true;
                panToMinimapPosition(e);
            });

            document.addEventListener('mousemove', (e) => {
                if (minimapDragging) {
                    panToMinimapPosition(e);
                }
            });

            document.addEventListener('mouseup', () => {
                minimapDragging = false;
            });

            function panToMinimapPosition(e) {
                const minimapRect = minimapContent.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                // Calculate click position relative to minimap
                const clickX = e.clientX - minimapRect.left;
                const clickY = e.clientY - minimapRect.top;

                // Convert to graph coordinates
                const graphX = (clickX / minimapRect.width) * graphWidth;
                const graphY = (clickY / minimapRect.height) * graphHeight;

                // Calculate offset to center the viewport on click point
                const visibleWidth = containerRect.width / lineageScale;
                const visibleHeight = containerRect.height / lineageScale;

                lineageOffsetX = -(graphX - visibleWidth / 2) * lineageScale;
                lineageOffsetY = -(graphY - visibleHeight / 2) * lineageScale;

                // Update main transform
                const currentGraphContainer = document.querySelector('#lineage-graph-container .lineage-graph-svg .lineage-graph-container');
                const currentZoomLevel = document.getElementById('lineage-zoom-level');
                if (currentGraphContainer) {
                    currentGraphContainer.setAttribute('transform', 'translate(' + lineageOffsetX + ',' + lineageOffsetY + ') scale(' + lineageScale + ')');
                }
                if (currentZoomLevel) {
                    currentZoomLevel.textContent = Math.round(lineageScale * 100) + '%';
                }

                updateMinimapViewport();
            }

            // Update minimap viewport when zooming/panning
            const originalUpdateTransform = function() {
                const currentGraphContainer = document.querySelector('#lineage-graph-container .lineage-graph-svg .lineage-graph-container');
                const currentZoomLevel = document.getElementById('lineage-zoom-level');
                if (!currentGraphContainer) return;
                currentGraphContainer.setAttribute('transform', 'translate(' + lineageOffsetX + ',' + lineageOffsetY + ') scale(' + lineageScale + ')');
                if (currentZoomLevel) {
                    currentZoomLevel.textContent = Math.round(lineageScale * 100) + '%';
                }
                updateMinimapViewport();
            };

            // Hook into zoom/pan events to update minimap
            const mainSvg = container.querySelector('.lineage-graph-svg');
            if (mainSvg) {
                mainSvg.addEventListener('wheel', updateMinimapViewport);
                mainSvg.addEventListener('mouseup', updateMinimapViewport);
            }

            // Initial viewport update
            setTimeout(updateMinimapViewport, 200);
        }

        // Initialize minimap after graph is ready
        setupMinimap();
    `;
}

function getColumnLineageScript(): string {
    return `
        // ========== Column Lineage Highlighting ==========

        let selectedColumn = null;

        function handleColumnLineageResult(data) {
            if (!data) return;

            const { tableId, columnName, upstream, downstream } = data;

            selectedColumn = { tableId, columnName };

            clearColumnHighlighting();

            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg) return;

            const upstreamColumns = new Set();
            const downstreamColumns = new Set();

            if (upstream && Array.isArray(upstream)) {
                upstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.type === 'column') {
                                upstreamColumns.add(node.id);
                            } else if (node.id && node.name) {
                                upstreamColumns.add(node.id);
                            }
                        });
                    }
                });
            }

            if (downstream && Array.isArray(downstream)) {
                downstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.type === 'column') {
                                downstreamColumns.add(node.id);
                            } else if (node.id && node.name) {
                                downstreamColumns.add(node.id);
                            }
                        });
                    }
                });
            }

            const selectedNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(tableId) + '"]');
            if (selectedNode) {
                const columnRows = selectedNode.querySelectorAll('.column-row');
                columnRows.forEach(row => {
                    const colName = row.getAttribute('data-column-name');
                    if (colName === columnName) {
                        row.classList.add('selected');
                        const stateText = row.querySelector('.column-state');
                        if (stateText) stateText.textContent = '◉';
                    } else {
                        row.classList.add('dimmed');
                    }
                });
            }

            upstreamColumns.forEach(nodeId => {
                const node = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(nodeId) + '"]');
                if (node && node !== selectedNode) {
                    node.classList.add('in-path', 'upstream');
                    const columnRows = node.querySelectorAll('.column-row');
                    columnRows.forEach(row => {
                        row.classList.add('in-path');
                        const stateText = row.querySelector('.column-state');
                        if (stateText) stateText.textContent = '●';
                    });
                }
            });

            downstreamColumns.forEach(nodeId => {
                const node = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(nodeId) + '"]');
                if (node && node !== selectedNode) {
                    node.classList.add('in-path', 'downstream');
                    const columnRows = node.querySelectorAll('.column-row');
                    columnRows.forEach(row => {
                        row.classList.add('in-path');
                        const stateText = row.querySelector('.column-state');
                        if (stateText) stateText.textContent = '●';
                    });
                }
            });

            const allNodes = svg.querySelectorAll('.lineage-node');
            allNodes.forEach(node => {
                const nodeId = node.getAttribute('data-node-id');
                if (nodeId !== tableId && !upstreamColumns.has(nodeId) && !downstreamColumns.has(nodeId)) {
                    node.classList.add('dimmed');
                }
            });

            drawColumnLineageEdges(tableId, columnName, upstream, downstream);
            showColumnLineageInfo(tableId, columnName, upstream, downstream);
        }

        function drawColumnLineageEdges(selectedTableId, selectedColumnName, upstream, downstream) {
            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg) return;

            const graphContainer = svg.querySelector('.lineage-graph-container');
            if (!graphContainer) return;

            svg.querySelectorAll('.column-lineage-edge').forEach(el => el.remove());

            const selectedNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(selectedTableId) + '"]');
            if (!selectedNode) return;

            const selectedColumnRow = selectedNode.querySelector('.column-row[data-column-name="' + CSS.escape(selectedColumnName) + '"]');
            if (!selectedColumnRow) return;

            const selectedPos = getColumnPosition(selectedNode, selectedColumnRow);
            if (!selectedPos) return;

            const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            edgeGroup.setAttribute('class', 'column-lineage-edges');
            graphContainer.insertBefore(edgeGroup, graphContainer.firstChild);

            if (upstream && Array.isArray(upstream)) {
                upstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.id && node.id !== selectedTableId) {
                                const sourceNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(node.id) + '"]');
                                if (sourceNode) {
                                    const sourceColumnRows = sourceNode.querySelectorAll('.column-row');
                                    sourceColumnRows.forEach(row => {
                                        const sourcePos = getColumnPosition(sourceNode, row);
                                        if (sourcePos) {
                                            drawColumnEdge(edgeGroup, sourcePos, selectedPos, 'upstream');
                                        }
                                    });
                                }
                            }
                        });
                    }
                });
            }

            if (downstream && Array.isArray(downstream)) {
                downstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.id && node.id !== selectedTableId) {
                                const targetNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(node.id) + '"]');
                                if (targetNode) {
                                    const targetColumnRows = targetNode.querySelectorAll('.column-row');
                                    targetColumnRows.forEach(row => {
                                        const targetPos = getColumnPosition(targetNode, row);
                                        if (targetPos) {
                                            drawColumnEdge(edgeGroup, selectedPos, targetPos, 'downstream');
                                        }
                                    });
                                }
                            }
                        });
                    }
                });
            }
        }

        function getColumnPosition(nodeElement, columnRow) {
            const transform = nodeElement.getAttribute('transform');
            if (!transform) return null;

            const match = transform.match(/translate\\\\(([-\\\\d.]+),\\\\s*([-\\\\d.]+)\\\\)/);
            if (!match) return null;

            const nodeX = parseFloat(match[1]);
            const nodeY = parseFloat(match[2]);

            const nodeBg = nodeElement.querySelector('.node-bg');
            const nodeWidth = nodeBg ? parseFloat(nodeBg.getAttribute('width') || 200) : 200;

            const allRows = nodeElement.querySelectorAll('.column-row');
            let rowIndex = 0;
            allRows.forEach((row, idx) => {
                if (row === columnRow) rowIndex = idx;
            });

            const columnY = 68 + (rowIndex * 24) - 4;

            return {
                left: { x: nodeX, y: nodeY + columnY },
                right: { x: nodeX + nodeWidth, y: nodeY + columnY },
                center: { x: nodeX + nodeWidth / 2, y: nodeY + columnY }
            };
        }

        function drawColumnEdge(container, fromPos, toPos, type) {
            const startX = fromPos.right.x;
            const startY = fromPos.right.y;
            const endX = toPos.left.x;
            const endY = toPos.left.y;

            const midX = (startX + endX) / 2;
            const pathD = 'M ' + startX + ' ' + startY +
                         ' C ' + midX + ' ' + startY + ', ' +
                               midX + ' ' + endY + ', ' +
                               endX + ' ' + endY;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'column-lineage-edge column-edge-' + type);
            path.setAttribute('d', pathD);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', type === 'upstream' ? '#22c55e' : '#3b82f6');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-opacity', '0.7');
            path.setAttribute('marker-end', 'url(#column-arrowhead-' + type + ')');

            container.appendChild(path);
        }

        function clearColumnHighlighting() {
            selectedColumn = null;

            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg) return;

            svg.querySelectorAll('.column-lineage-edges').forEach(el => el.remove());

            const allNodes = svg.querySelectorAll('.lineage-node');
            allNodes.forEach(node => {
                node.classList.remove('in-path', 'upstream', 'downstream', 'dimmed');
            });

            const columnRows = svg.querySelectorAll('.column-row');
            columnRows.forEach(row => {
                row.classList.remove('selected', 'in-path', 'dimmed');
                const stateText = row.querySelector('.column-state');
                if (stateText) {
                    const isPrimaryKey = row.querySelector('.column-dot.primary');
                    stateText.textContent = isPrimaryKey ? '●' : '○';
                }
            });

            hideColumnLineageInfo();
        }

        function showColumnLineageInfo(tableId, columnName, upstream, downstream) {
            let infoPanel = document.getElementById('column-lineage-info');
            if (!infoPanel) {
                infoPanel = document.createElement('div');
                infoPanel.id = 'column-lineage-info';
                infoPanel.className = 'column-lineage-info';
                const container = document.getElementById('lineage-graph-container');
                if (container) container.appendChild(infoPanel);
            }

            const upstreamCount = upstream ? upstream.reduce((sum, p) => sum + (p.nodes?.length || 0), 0) : 0;
            const downstreamCount = downstream ? downstream.reduce((sum, p) => sum + (p.nodes?.length || 0), 0) : 0;

            const tableName = tableId.includes(':') ? tableId.split(':')[1] : tableId;

            infoPanel.innerHTML = '<div class="info-header">' +
                    '<span class="info-icon">📝</span>' +
                    '<span class="info-title">' + escapeHtml(tableName) + '.' + escapeHtml(columnName) + '</span>' +
                    '<button class="info-close" onclick="clearColumnHighlighting()">×</button>' +
                '</div>' +
                '<div class="info-stats">' +
                    '<span class="stat upstream" title="Upstream sources">⬆ ' + upstreamCount + ' sources</span>' +
                    '<span class="stat downstream" title="Downstream consumers">⬇ ' + downstreamCount + ' consumers</span>' +
                '</div>' +
                '<div class="info-hint">Click another column to trace its lineage, or click background to clear.</div>';
            infoPanel.style.display = 'block';
        }

        function hideColumnLineageInfo() {
            const infoPanel = document.getElementById('column-lineage-info');
            if (infoPanel) {
                infoPanel.style.display = 'none';
            }
        }
    `;
}

function getDirectionButtonsScript(): string {
    return `
        // Setup direction buttons (for both graph view and empty state)
        function setupDirectionButtons() {
            const directionBtns = document.querySelectorAll('.direction-btn[data-direction][data-node-id]');
            directionBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const direction = btn.getAttribute('data-direction');
                    const nodeId = btn.getAttribute('data-node-id');
                    if (direction && nodeId) {
                        if (lineageContent) {
                            lineageContent.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 300px;"><div class="skeleton-loader" style="width: 200px;"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>';
                        }
                        lineageCurrentDirection = direction;
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            direction: direction,
                            depth: 5,
                            expandedNodes: lineageExpandedNodes ? Array.from(lineageExpandedNodes) : []
                        });
                    }
                });
            });
        }
    `;
}

function getUtilityScript(): string {
    return `
        function escapeHtml(text) {
            return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function escapeHtmlAttr(text) {
            return escapeHtml(text).replace(/"/g, '&quot;');
        }
    `;
}

/**
 * Generate script for issues view
 */
export function getIssuesScript(nonce: string): string {
    return `<script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.getElementById('btn-back').addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'graph' });
        });

        document.querySelectorAll('.list-item, .missing-ref-item').forEach(item => {
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-filepath');
                const line = item.getAttribute('data-line');
                if (filePath) {
                    vscode.postMessage({
                        command: 'openFileAtLine',
                        filePath: filePath,
                        line: parseInt(line) || 0
                    });
                }
            });
        });
    </script>`;
}

/**
 * Generate minimal script for simple state pages (loading, error, manual index)
 */
export function getMinimalScript(nonce: string): string {
    return `<script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>`;
}
