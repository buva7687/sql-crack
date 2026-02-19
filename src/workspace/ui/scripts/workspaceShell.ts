/**
 * Script fragment: workspace-level keyboard shortcuts and graph action wiring.
 */
export function getWorkspaceShellScriptFragment(): string {
    return `
        // ========== Keyboard Shortcuts ==========
        document.addEventListener('keydown', (e) => {
            // Skip ALL shortcuts if typing in any input or select
            const activeEl = document.activeElement;
            const isTyping = activeEl?.tagName === 'INPUT' ||
                             activeEl?.tagName === 'TEXTAREA' ||
                             activeEl?.tagName === 'SELECT' ||
                             activeEl?.isContentEditable;

            // Cmd/Ctrl+F: Focus search (works even when typing)
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInput?.focus();
                searchInput?.select();
                return;
            }

            // Escape: Clear search (if in search input) or clear selection
            if (e.key === 'Escape') {
                if (activeEl === searchInput) {
                    searchInput.blur();
                    clearSearch();
                    return;
                }
                // Only clear selection if not typing anywhere
                if (!isTyping && selectedNodeId) {
                    clearSelection();
                }
                return;
            }

            // Skip all other shortcuts if typing
            if (isTyping) return;

            // Check if graph view is active
            const graphTab = document.querySelector('.view-tab[data-view="graph"]');
            const isGraphTabActive = graphTab?.classList.contains('active');
            if (!isGraphTabActive) return;

            // F: Toggle focus mode
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                if (selectedNodeId) {
                    setFocusMode(!focusModeEnabled);
                }
                return;
            }

            // U: Trace upstream
            if (e.key === 'u' || e.key === 'U') {
                e.preventDefault();
                if (selectedNodeId) { setTraceMode('upstream'); }
                return;
            }
            // D: Trace downstream
            if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                if (selectedNodeId) { setTraceMode('downstream'); }
                return;
            }

            // R: Reset view (fit to screen)
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                resetView();
                return;
            }

            // L: Toggle bottom legend bar
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                toggleGraphLegend();
                return;
            }
        });

        // ========== Sidebar Toggle ==========
        document.getElementById('btn-sidebar')?.addEventListener('click', () => {
            sidebar?.classList.toggle('collapsed');
            scheduleGraphAutoFit();
        });
        document.getElementById('btn-sidebar-close')?.addEventListener('click', () => {
            sidebar?.classList.add('collapsed');
            scheduleGraphAutoFit();
        });

        // ========== Section Toggles ==========
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('expanded');
            });
        });

        // ========== Commands ==========
        function refresh() {
            document.body.style.cursor = 'wait';
            vscode.postMessage({ command: 'refresh' });
        }
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

        function prefillImpactSelection(nodeLabel, nodeId, nodeType, attempt = 0) {
            const impactInput = document.getElementById('impact-table-input');
            const impactTableId = document.getElementById('impact-table-id');
            const impactBadge = document.getElementById('impact-selected-badge');
            const impactLabel = document.getElementById('impact-selected-label');
            const impactAnalyzeBtn = document.getElementById('impact-analyze-btn');
            const loader = document.getElementById('impact-typeahead-loading');

            if (!impactInput || !impactTableId) {
                if (attempt < 8) {
                    if (loader && attempt === 0) loader.style.display = 'flex';
                    setTimeout(() => prefillImpactSelection(nodeLabel, nodeId, nodeType, attempt + 1), 80);
                } else if (loader) {
                    loader.style.display = 'none';
                }
                return;
            }
            if (loader) loader.style.display = 'none';

            impactInput.value = nodeLabel;
            impactTableId.value = nodeId;
            impactTableId.dataset.name = nodeLabel;
            impactTableId.dataset.type = nodeType || 'table';
            if (impactBadge) {
                impactBadge.style.display = 'inline-flex';
            }
            if (impactLabel) {
                impactLabel.textContent = nodeLabel + ' (' + (nodeType || 'table') + ')';
            }
            if (impactAnalyzeBtn) {
                impactAnalyzeBtn.disabled = false;
            }
        }

        function scheduleImpactSelectionPrefill(nodeLabel, nodeId, nodeType) {
            setTimeout(() => prefillImpactSelection(nodeLabel, nodeId, nodeType), 120);
        }

        document.getElementById('btn-refresh')?.addEventListener('click', refresh);
        focusBtn?.addEventListener('click', () => {
            const nextState = !focusModeEnabled;
            // Focus mode is mutually exclusive with trace mode
            if (nextState && traceMode) {
                traceMode = null;
                clearTraceMode();
                updateTraceButtons();
            }
            setFocusMode(nextState);
            if (selectionEmpty) {
                selectionEmpty.textContent = nextState && !selectedNodeId
                    ? 'Select a node to focus on its neighbors.'
                    : selectionEmptyText;
            }
        });
        traceUpBtn?.addEventListener('click', () => {
            if (!selectedNodeId) {
                if (selectionEmpty) selectionEmpty.textContent = 'Select a node to trace its upstream sources.';
                return;
            }
            setTraceMode('upstream');
        });
        traceDownBtn?.addEventListener('click', () => {
            if (!selectedNodeId) {
                if (selectionEmpty) selectionEmpty.textContent = 'Select a node to trace its downstream consumers.';
                return;
            }
            setTraceMode('downstream');
        });
        updateGraphActionButtons();
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

            if (activeEmptyState === 'welcome' && actionEl.closest('#graph-empty-overlay')) {
                markWelcomeSeen();
            }

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
                case 'view-lineage': {
                    const nodeId = actionEl.getAttribute('data-node-id') || selectedNodeId;
                    const nodeLabel = actionEl.getAttribute('data-node-label') || '';
                    const nodeType = actionEl.getAttribute('data-node-type') || '';
                    if (!nodeId) {
                        break;
                    }
                    switchToView('lineage', false, nodeLabel, nodeType);
                    if (lineageTitle) {
                        lineageTitle.textContent = 'Data Lineage';
                    }
                    setTimeout(() => {
                        if (typeof selectLineageNode === 'function') {
                            selectLineageNode(nodeId);
                        }
                    }, 120);
                    break;
                }
                case 'analyze-impact': {
                    const nodeLabel = actionEl.getAttribute('data-node-label') || '';
                    const nodeType = actionEl.getAttribute('data-node-type') || 'table';
                    const nodeId = actionEl.getAttribute('data-node-id') || '';
                    if (!nodeLabel) {
                        break;
                    }
                    switchToView('impact', false, nodeLabel, nodeType);
                    if (lineageTitle) {
                        lineageTitle.textContent = 'Impact Analysis';
                    }
                    scheduleImpactSelectionPrefill(nodeLabel, nodeId, nodeType);
                    break;
                }
                case 'open-file': {
                    const filePath = actionEl.getAttribute('data-file-path') || '';
                    if (filePath) {
                        openFile(filePath);
                    }
                    break;
                }
                case 'dismiss-welcome':
                    markWelcomeSeen();
                    updateGraphEmptyState();
                    break;
            }
        });
    `;
}
