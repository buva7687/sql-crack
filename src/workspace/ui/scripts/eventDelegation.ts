export function getEventDelegationScriptFragment(): string {
    return `
        // ========== Event Delegation for Dynamic Lineage Content ==========
        if (lineageContent) {
            lineageContent.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;

                const action = target.getAttribute('data-action');
                const tableName = target.getAttribute('data-table');
                const nodeId = target.getAttribute('data-node-id');
                const nodeType = target.getAttribute('data-node-type') || target.getAttribute('data-type') || 'table';

                if (action === 'export-impact-report') {
                    const requested = target.getAttribute('data-format') || 'markdown';
                    const format = requested === 'json' ? 'impact-json' : 'impact-markdown';
                    vscode.postMessage({
                        command: 'export',
                        format: format
                    });
                    return;
                }

                if (action && action.indexOf('cross-view-') === 0) {
                    const inferredNodeId = nodeId || (tableName ? ('table:' + tableName.toLowerCase()) : '');

                    if (action === 'cross-view-lineage') {
                        if (!inferredNodeId) { return; }

                        switchToView('lineage', false, tableName || '', nodeType);
                        if (lineageTitle) {
                            lineageTitle.textContent = 'Data Lineage';
                        }
                        setTimeout(() => {
                            selectLineageNode(inferredNodeId);
                        }, 120);
                        return;
                    }

                    if (action === 'cross-view-detail') {
                        if (!tableName) { return; }

                        switchToView('lineage', false, tableName, nodeType);
                        if (lineageTitle) {
                            lineageTitle.textContent = 'Table: ' + tableName;
                        }
                        if (lineageContent) {
                            lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading table details...</div></div>';
                        }
                        lineageDetailView = true;
                        updateBackButtonText();
                        setTimeout(() => {
                            vscode.postMessage({ command: 'exploreTable', tableName: tableName, nodeId: inferredNodeId || nodeId });
                        }, 120);
                        return;
                    }

                    if (action === 'cross-view-impact') {
                        if (!tableName) { return; }

                        switchToView('impact', false, tableName, nodeType);
                        if (lineageTitle) {
                            lineageTitle.textContent = 'Impact Analysis';
                        }
                        scheduleImpactSelectionPrefill(tableName, inferredNodeId, nodeType);
                        return;
                    }
                }

                if (!tableName) return;

                lineageDetailView = true;
                updateBackButtonText();

                switch (action) {
                    case 'explore-table':
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + tableName;
                        lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';
                        // Send nodeId if available (for views/CTEs), fallback to tableName for backward compat
                        vscode.postMessage({ command: 'exploreTable', tableName: tableName, nodeId: nodeId });
                        break;
                    case 'show-upstream':
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + tableName;
                        lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';
                        vscode.postMessage({ command: 'getUpstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: lineageDepth });
                        break;
                    case 'show-downstream':
                        if (lineageTitle) lineageTitle.textContent = 'Downstream of ' + tableName;
                        lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';
                        vscode.postMessage({ command: 'getDownstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: lineageDepth });
                        break;
                }
            });

            lineageContent.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') {
                    return;
                }
                const target = e.target.closest('[data-action]');
                if (!target) {
                    return;
                }
                e.preventDefault();
                target.click();
            });
        }
    `;
}
