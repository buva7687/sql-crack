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

            // Escape: Clear search first, then clear selection
            if (e.key === 'Escape') {
                // In lineage graph, prioritize clearing active column trace panel/overlays.
                if (!isTyping && window.__workspaceColumnTraceActive && typeof window.clearWorkspaceColumnTrace === 'function') {
                    e.preventDefault();
                    window.clearWorkspaceColumnTrace();
                    if (typeof updateWorkspaceBreadcrumb === 'function') {
                        updateWorkspaceBreadcrumb();
                    }
                    return;
                }
                // If actively typing in search, blur and clear
                if (activeEl === searchInput) {
                    searchInput.blur();
                    clearSearch();
                    return;
                }
                // If search has content, clear it (even if not focused)
                if (!isTyping && searchInput && searchInput.value.trim()) {
                    clearSearch();
                    return;
                }
                // Otherwise clear selection
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

            // Tab: Cycle through nodes in visual left-to-right, top-to-bottom order
            if (e.key === 'Tab') {
                e.preventDefault();
                const allNodes = getNodesSortedByPosition();
                if (allNodes.length === 0) return;
                const currentIdx = selectedNodeId
                    ? allNodes.findIndex(function(n) { return n.getAttribute('data-id') === selectedNodeId; })
                    : -1;
                const nextIdx = e.shiftKey
                    ? (currentIdx <= 0 ? allNodes.length - 1 : currentIdx - 1)
                    : (currentIdx + 1) % allNodes.length;
                updateSelectionPanel(allNodes[nextIdx]);
                scrollNodeIntoView(allNodes[nextIdx]);
                return;
            }

            // Arrow keys: Navigate to nearest node in the pressed direction (spatial)
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const allNodes = Array.from(document.querySelectorAll('.node'));
                if (allNodes.length === 0) return;
                if (!selectedNodeId) {
                    // No selection yet — select the first node by position
                    const sorted = getNodesSortedByPosition();
                    if (sorted.length > 0) {
                        updateSelectionPanel(sorted[0]);
                        scrollNodeIntoView(sorted[0]);
                    }
                    return;
                }
                const current = document.querySelector('.node[data-id="' + CSS.escape(selectedNodeId) + '"]');
                if (!current) return;
                // Search ALL nodes in the pressed direction, not just edge-adjacent
                const candidates = allNodes.filter(function(n) { return n !== current; });
                const best = pickDirectionalNeighbor(current, candidates, e.key);
                if (best) {
                    updateSelectionPanel(best);
                    scrollNodeIntoView(best);
                }
                return;
            }

            // Enter: Open file for selected node
            if (e.key === 'Enter') {
                if (!selectedNodeId) return;
                const sel = document.querySelector('.node[data-id="' + CSS.escape(selectedNodeId) + '"]');
                if (sel) {
                    const fp = sel.getAttribute('data-filepath');
                    if (fp) openFile(fp);
                }
                return;
            }
        });

        function getNodesSortedByPosition() {
            var nodes = Array.from(document.querySelectorAll('.node'));
            nodes.sort(function(a, b) {
                var ca = getNodeCenter(a);
                var cb = getNodeCenter(b);
                // Sort by y first (rows), then by x (left-to-right within a row)
                // Use a threshold to group nodes on the same visual row
                var rowThreshold = 30;
                if (Math.abs(ca.y - cb.y) > rowThreshold) return ca.y - cb.y;
                return ca.x - cb.x;
            });
            return nodes;
        }

        function getNodeCenter(nodeEl) {
            var transform = nodeEl.getAttribute('transform') || '';
            var match = /translate\\(([-\\d.]+)[,\\s]+([-\\d.]+)\\)/.exec(transform);
            if (match) return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
            var bbox = nodeEl.getBBox ? nodeEl.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
            return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
        }

        function pickDirectionalNeighbor(currentNode, candidates, key) {
            var cur = getNodeCenter(currentNode);
            var best = null;
            var bestScore = Infinity;
            for (var i = 0; i < candidates.length; i++) {
                var c = getNodeCenter(candidates[i]);
                var dx = c.x - cur.x;
                var dy = c.y - cur.y;
                var ok = false;
                if (key === 'ArrowUp') ok = dy < -5;
                if (key === 'ArrowDown') ok = dy > 5;
                if (key === 'ArrowLeft') ok = dx < -5;
                if (key === 'ArrowRight') ok = dx > 5;
                if (!ok) continue;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestScore) {
                    bestScore = dist;
                    best = candidates[i];
                }
            }
            // Fallback: if no node in the exact direction, pick the closest neighbor
            if (!best && candidates.length > 0) {
                for (var i = 0; i < candidates.length; i++) {
                    var c = getNodeCenter(candidates[i]);
                    var dist = Math.sqrt((c.x - cur.x) * (c.x - cur.x) + (c.y - cur.y) * (c.y - cur.y));
                    if (dist < bestScore) {
                        bestScore = dist;
                        best = candidates[i];
                    }
                }
            }
            return best;
        }

        function scrollNodeIntoView(nodeEl) {
            var center = getNodeCenter(nodeEl);
            var container = document.querySelector('.graph-area');
            if (!container || !svg) return;
            var containerRect = container.getBoundingClientRect();
            var targetX = center.x * scale + offsetX;
            var targetY = center.y * scale + offsetY;
            // If node is outside visible area, pan to center it
            if (targetX < 0 || targetX > containerRect.width || targetY < 0 || targetY > containerRect.height) {
                offsetX = containerRect.width / 2 - center.x * scale;
                offsetY = containerRect.height / 2 - center.y * scale;
                updateTransform();
            }
        }

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
            if (typeof trackUxEvent === 'function') {
                trackUxEvent('graph_refresh_requested', { view: currentViewMode });
            }
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
                case 'apply-suggestion': {
                    const suggestion = actionEl.getAttribute('data-suggestion') || '';
                    if (!suggestion) {
                        break;
                    }
                    if (searchInput) {
                        searchInput.value = suggestion;
                    }
                    performSearch();
                    break;
                }
                case 'refresh':
                    refresh();
                    break;
                case 'view-issues':
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_view_issues_opened', { source: activeEmptyState || 'action' });
                    }
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
                case 'trace-upstream':
                    if (selectedNodeId) {
                        setTraceMode('upstream');
                    } else if (selectionEmpty) {
                        selectionEmpty.textContent = 'Select a node to trace its upstream sources.';
                    }
                    break;
                case 'trace-downstream':
                    if (selectedNodeId) {
                        setTraceMode('downstream');
                    } else if (selectionEmpty) {
                        selectionEmpty.textContent = 'Select a node to trace its downstream consumers.';
                    }
                    break;
                case 'clear-graph-state':
                    if (focusModeEnabled) {
                        setFocusMode(false);
                    }
                    if (traceMode) {
                        setTraceMode(traceMode);
                    }
                    if (typeof clearPathState === 'function') {
                        clearPathState(true);
                    }
                    clearSearch();
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_state_cleared');
                    }
                    break;
                case 'path-set-start':
                    if (selectedNodeId && typeof setPathEndpoint === 'function') {
                        setPathEndpoint('start', selectedNodeId);
                    } else if (selectionEmpty) {
                        selectionEmpty.textContent = 'Select a node first, then set it as path start.';
                    }
                    break;
                case 'path-set-end':
                    if (selectedNodeId && typeof setPathEndpoint === 'function') {
                        setPathEndpoint('end', selectedNodeId);
                    } else if (selectionEmpty) {
                        selectionEmpty.textContent = 'Select a node first, then set it as path end.';
                    }
                    break;
                case 'path-show':
                    if (typeof showPathBetweenEndpoints === 'function') {
                        showPathBetweenEndpoints();
                    }
                    break;
                case 'path-clear':
                    if (typeof clearPathState === 'function') {
                        clearPathState(true);
                    }
                    break;
                case 'clear-selection':
                    clearSelection();
                    break;
                case 'view-lineage': {
                    const nodeId = actionEl.getAttribute('data-node-id') || selectedNodeId;
                    const nodeLabel = actionEl.getAttribute('data-node-label') || '';
                    const nodeType = actionEl.getAttribute('data-node-type') || '';
                    const filePath = actionEl.getAttribute('data-file-path') || '';
                    if (!nodeId) {
                        break;
                    }
                    switchToView('lineage', false, nodeLabel, nodeType);
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_trace_in_lineage', { nodeType: nodeType || 'unknown' });
                    }
                    if (lineageTitle) {
                        lineageTitle.textContent = 'Data Lineage';
                    }
                    if (nodeType === 'file' && filePath) {
                        if (lineageContent) {
                            lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Tracing file dependencies...</div></div>';
                        }
                        vscode.postMessage({
                            command: 'getUpstream',
                            nodeType: 'file',
                            filePath,
                            depth: lineageDepth
                        });
                    } else {
                        if (lineageContent) {
                            lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading lineage...</div></div>';
                        }
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            nodeLabel: nodeLabel,
                            nodeType: nodeType,
                            direction: 'both',
                            depth: lineageDepth
                        });
                    }
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
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_analyze_in_impact', { nodeType: nodeType || 'unknown' });
                    }
                    if (lineageTitle) {
                        lineageTitle.textContent = 'Impact Analysis';
                    }
                    scheduleImpactSelectionPrefill(nodeLabel, nodeId, nodeType);
                    break;
                }
                case 'show-file-tables': {
                    const filePath = actionEl.getAttribute('data-file-path') || '';
                    if (!filePath) {
                        break;
                    }
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_show_file_tables', { fromMode: currentGraphMode });
                    }
                    const queryValue = basenameFromPath(filePath) || filePath;
                    switchGraphModeFromAction('tables');
                    setTimeout(() => {
                        if (searchInput) {
                            searchInput.value = queryValue;
                            if (typeof performSearch === 'function') {
                                performSearch();
                            } else {
                                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }
                    }, 140);
                    break;
                }
                case 'open-file': {
                    const filePath = actionEl.getAttribute('data-file-path') || '';
                    if (filePath) {
                        if (typeof trackUxEvent === 'function') {
                            trackUxEvent('graph_open_file', { nodeType: actionEl.getAttribute('data-node-type') || 'unknown' });
                        }
                        openFile(filePath);
                    }
                    break;
                }
                case 'open-edge-reference': {
                    const filePath = actionEl.getAttribute('data-file-path') || '';
                    const lineNumber = Number(actionEl.getAttribute('data-line-number') || '1');
                    if (filePath) {
                        openFileAtLine(filePath, Number.isFinite(lineNumber) && lineNumber > 0 ? lineNumber : 1);
                    }
                    break;
                }
                case 'why-this-graph':
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_why_panel_toggled');
                    }
                    if (activeEmptyState === 'welcome') {
                        markWelcomeSeen();
                        if (typeof updateGraphEmptyState === 'function') {
                            updateGraphEmptyState();
                        }
                        if (typeof setGraphExplainPanelVisible === 'function') {
                            setGraphExplainPanelVisible(true);
                        }
                    } else if (typeof toggleGraphExplainPanel === 'function') {
                        toggleGraphExplainPanel();
                    }
                    break;
                case 'dismiss-why':
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_why_panel_dismissed');
                    }
                    if (typeof setGraphExplainPanelVisible === 'function') {
                        setGraphExplainPanelVisible(false);
                    }
                    break;
                case 'dismiss-welcome':
                    if (typeof trackUxEvent === 'function') {
                        trackUxEvent('graph_welcome_dismissed');
                    }
                    markWelcomeSeen();
                    updateGraphEmptyState();
                    break;
            }
        });
    `;
}
