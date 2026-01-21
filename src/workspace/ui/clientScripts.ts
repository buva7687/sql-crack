// Client Scripts - JavaScript for workspace webviews
// Extracted from workspacePanel.ts for modularity

/**
 * Parameters for generating webview script
 */
export interface WebviewScriptParams {
    nonce: string;
    graphData: string;
    searchFilterQuery: string;
}

/**
 * Generate the complete client script for main webview
 */
export function getWebviewScript(params: WebviewScriptParams): string {
    const { nonce, graphData, searchFilterQuery } = params;

    return `
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const graphData = ${graphData};

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

        function fitToScreen() {
            if (!svg || !mainGroup || graphData.nodes.length === 0) return;

            const container = svg.parentElement;
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const node of graphData.nodes) {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x + node.width);
                maxY = Math.max(maxY, node.y + node.height);
            }

            const graphWidth = maxX - minX + 100;
            const graphHeight = maxY - minY + 100;

            scale = Math.min(containerWidth / graphWidth, containerHeight / graphHeight, 1.5);
            scale = Math.max(0.2, Math.min(scale, 1.5));

            offsetX = (containerWidth - graphWidth * scale) / 2 - minX * scale + 50;
            offsetY = (containerHeight - graphHeight * scale) / 2 - minY * scale + 50;

            updateTransform();
        }

        // ========== Pan/Zoom Setup ==========
        if (svg && mainGroup) {
            updateTransform();

            svg.addEventListener('mousedown', (e) => {
                if (e.target === svg || e.target.closest('.edge')) {
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

        document.getElementById('btn-refresh')?.addEventListener('click', refresh);
        document.getElementById('btn-view-issues')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'issues' });
        });
        document.getElementById('btn-all-issues')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'issues' });
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
        const viewTabs = document.querySelectorAll('.view-tab');
        const lineagePanel = document.getElementById('lineage-panel');
        const lineageContent = document.getElementById('lineage-content');
        const lineageTitle = document.getElementById('lineage-title');
        const lineageBackBtn = document.getElementById('lineage-back-btn');
        const graphArea = document.querySelector('.graph-area');

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

        function switchToView(view) {
            if (view === currentViewMode) return;

            viewTabs.forEach(t => {
                if (t.getAttribute('data-view') === view) {
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                }
            });
            currentViewMode = view;

            if (view === 'graph') {
                lineagePanel?.classList.remove('visible');
                if (graphArea) graphArea.style.display = '';
            } else {
                if (graphArea) graphArea.style.display = 'none';
                lineagePanel?.classList.add('visible');

                if (lineageTitle) {
                    lineageTitle.textContent = viewTitles[view] || 'Data Lineage';
                }

                if (lineageContent) {
                    lineageContent.innerHTML = viewEmptyStates[view] || '';
                }

                if (view === 'lineage') {
                    vscode.postMessage({ command: 'switchToLineageView' });
                } else if (view === 'tableExplorer') {
                    vscode.postMessage({ command: 'switchToTableExplorer' });
                } else if (view === 'impact') {
                    vscode.postMessage({ command: 'switchToImpactView' });
                }
            }
        }

        viewTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                const view = tab.getAttribute('data-view');
                switchToView(view);
            });
        });

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
                lineageDetailView = false;
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

            const exploreItem = contextMenu.querySelector('[data-action="exploreTable"]');
            if (exploreItem) {
                if (nodeData.type === 'file') {
                    exploreItem.classList.add('disabled');
                } else {
                    exploreItem.classList.remove('disabled');
                }
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
                if (!contextMenuTarget || item.classList.contains('disabled')) return;

                const action = item.getAttribute('data-action');
                const nodeName = contextMenuTarget.label || contextMenuTarget.id;

                switch (action) {
                    case 'showUpstream':
                        switchToView('lineage');
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Loading upstream dependencies...</p></div>';
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
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Loading downstream dependencies...</p></div>';
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
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Analyzing impact...</p></div>';
                        vscode.postMessage({
                            command: 'analyzeImpact',
                            type: contextMenuTarget.type === 'file' ? 'table' : 'table',
                            name: nodeName,
                            changeType: 'modify'
                        });
                        break;
                    case 'exploreTable':
                        switchToView('tableExplorer');
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Loading table details...</p></div>';
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
                        console.log('[Lineage] Ignoring lineageGraphResult during setup');
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
            }
        });
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
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + tableName;
                        lineageContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
                        vscode.postMessage({ command: 'exploreTable', tableName: tableName });
                        break;
                    case 'show-upstream':
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + tableName;
                        lineageContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
                        vscode.postMessage({ command: 'getUpstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: 5 });
                        break;
                    case 'show-downstream':
                        if (lineageTitle) lineageTitle.textContent = 'Downstream of ' + tableName;
                        lineageContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
                        vscode.postMessage({ command: 'getDownstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: 5 });
                        break;
                }
            });
        }

        // ========== Issue Item Clicks ==========
        document.querySelectorAll('.issue-item').forEach(item => {
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-filepath');
                const line = item.getAttribute('data-line');
                if (filePath) {
                    openFileAtLine(filePath, parseInt(line) || 0);
                }
            });
        });
    `;
}

function getNodeInteractionsScript(): string {
    return `
        // ========== Node Interactions ==========
        if (svg) {
            svg.addEventListener('click', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const filePath = node.getAttribute('data-filepath');
                    if (filePath) openFile(filePath);
                }
            });

            svg.addEventListener('dblclick', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const filePath = node.getAttribute('data-filepath');
                    if (filePath) visualizeFile(filePath);
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

                    showContextMenu(e, {
                        id: nodeId,
                        label: nodeLabel,
                        type: nodeType,
                        filePath: filePath
                    });
                }
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

            changeTypeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    changeTypeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
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
                        type: tableType === 'view' ? 'table' : 'table',
                        name: tableName,
                        changeType: changeType
                    });
                });
            }
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
                    if (visibleItems.length < totalItems || searchQuery || typeValue !== 'all') {
                        resultsInfo.style.display = 'block';
                        resultsCount.textContent = 'Showing ' + visibleItems.length + ' of ' + totalItems + ' tables';
                    } else {
                        resultsInfo.style.display = 'none';
                    }
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
        let lineageSearchData = [];
        let lineageTypeFilter = 'all';
        let lineageSearchTimeout = null;

        function setupVisualLineageSearch() {
            const searchInput = document.getElementById('lineage-search-input');
            const searchClear = document.getElementById('lineage-search-clear');
            const searchResults = document.getElementById('lineage-search-results');
            const filterChips = document.querySelectorAll('.quick-filters .filter-chip');
            const popularItems = document.querySelectorAll('.popular-item[data-action="select-node"]');
            const recentItems = document.querySelectorAll('.recent-item[data-action="select-node"]');
            const dataScript = document.getElementById('lineage-searchable-nodes');
            const popularList = document.querySelector('.popular-list');

            if (dataScript) {
                try {
                    lineageSearchData = JSON.parse(dataScript.textContent || '[]');
                } catch (e) {
                    lineageSearchData = [];
                }
            }

            function filterPopularTables(typeFilter) {
                if (!popularList) return;
                const items = popularList.querySelectorAll('.popular-item');
                items.forEach(item => {
                    const nodeType = item.getAttribute('data-node-type');
                    if (typeFilter === 'all' || nodeType === typeFilter) {
                        item.classList.remove('filtered-out');
                    } else {
                        item.classList.add('filtered-out');
                    }
                });
            }

            searchInput?.addEventListener('input', () => {
                const query = searchInput.value.trim();
                if (searchClear) searchClear.style.display = query ? 'flex' : 'none';

                clearTimeout(lineageSearchTimeout);
                lineageSearchTimeout = setTimeout(() => {
                    if (query.length >= 1) {
                        const results = searchLineageLocal(query);
                        showLineageSearchResults(results);
                        vscode.postMessage({ command: 'searchLineageTables', query, typeFilter: lineageTypeFilter });
                    } else {
                        hideLineageSearchResults();
                    }
                }, 150);
            });

            searchInput?.addEventListener('focus', () => {
                const query = searchInput.value.trim();
                if (query.length >= 1) {
                    const results = searchLineageLocal(query);
                    showLineageSearchResults(results);
                }
            });

            searchInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    hideLineageSearchResults();
                    searchInput.blur();
                } else if (e.key === 'Enter') {
                    const firstResult = searchResults?.querySelector('.search-result-item');
                    if (firstResult) {
                        firstResult.click();
                    }
                }
            });

            searchClear?.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (searchClear) searchClear.style.display = 'none';
                hideLineageSearchResults();
                searchInput?.focus();
            });

            filterChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    filterChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    lineageTypeFilter = chip.getAttribute('data-filter') || 'all';

                    filterPopularTables(lineageTypeFilter);

                    const query = searchInput?.value.trim();
                    if (query) {
                        const results = searchLineageLocal(query);
                        showLineageSearchResults(results);
                    }
                });
            });

            popularItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                    }
                });
            });

            recentItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                    }
                });
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-form')) {
                    hideLineageSearchResults();
                }
            });
        }

        function searchLineageLocal(query) {
            const queryLower = query.toLowerCase();
            return lineageSearchData
                .filter(node => {
                    const matchesQuery = node.name.toLowerCase().includes(queryLower);
                    const matchesType = lineageTypeFilter === 'all' || node.type === lineageTypeFilter;
                    return matchesQuery && matchesType;
                })
                .slice(0, 10);
        }

        function showLineageSearchResults(results) {
            const searchResults = document.getElementById('lineage-search-results');
            if (!searchResults) return;

            if (!results || results.length === 0) {
                searchResults.innerHTML = '<div class="search-result-item" style="justify-content: center; color: var(--text-dim);">No results found</div>';
                searchResults.style.display = 'block';
                return;
            }

            const icons = { table: '📊', view: '👁️', cte: '🔄', external: '🌐' };
            searchResults.innerHTML = results.map(node => {
                const fileName = node.filePath ? node.filePath.split('/').pop() : '';
                return '<div class="search-result-item" data-node-id="' + escapeHtmlAttr(node.id) + '">' +
                    '<span class="result-icon">' + (icons[node.type] || '📦') + '</span>' +
                    '<span class="result-name">' + escapeHtml(node.name) + '</span>' +
                    '<span class="result-type">' + node.type + '</span>' +
                    (fileName ? '<span class="result-file">' + escapeHtml(fileName) + '</span>' : '') +
                '</div>';
            }).join('');

            searchResults.style.display = 'block';

            searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                        hideLineageSearchResults();
                    }
                });
            });
        }

        function hideLineageSearchResults() {
            const searchResults = document.getElementById('lineage-search-results');
            if (searchResults) {
                searchResults.style.display = 'none';
            }
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
                    const padding = 80;
                    const availableWidth = containerRect.width - padding;
                    const availableHeight = containerRect.height - padding;
                    const scaleX = availableWidth / bbox.width;
                    const scaleY = availableHeight / bbox.height;

                    lineageScale = Math.min(scaleX, scaleY);
                    lineageScale = Math.max(0.2, Math.min(1.5, lineageScale));

                    const bboxCenterX = bbox.x + bbox.width / 2;
                    const bboxCenterY = bbox.y + bbox.height / 2;
                    const containerCenterX = containerRect.width / 2;
                    const containerCenterY = containerRect.height / 2;

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
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            direction: direction,
                            depth: 5
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

            const rect = node.getBoundingClientRect();
            tooltip.style.left = (rect.right + 10) + 'px';
            tooltip.style.top = rect.top + 'px';
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
                        navigator.clipboard.writeText(nodeName);
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
                console.warn('[Lineage] Cannot expand node: no graph loaded');
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
                console.warn('[Lineage] Cannot collapse node: no graph loaded');
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
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            direction: direction,
                            depth: 5
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
    return `
    <script nonce="${nonce}">
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
