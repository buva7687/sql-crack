/**
 * Script fragment: graph context menu interactions.
 */
export function getContextMenuScriptFragment(): string {
    return `
        // ========== Context Menu ==========
        const contextMenu = document.getElementById('context-menu');
        let contextMenuTarget = null;
        let contextMenuReturnFocus = null;

        function getEnabledContextMenuItems() {
            if (!contextMenu) return [];
            return Array.from(contextMenu.querySelectorAll('.context-menu-item')).filter(item =>
                item.style.display !== 'none'
                && !item.classList.contains('disabled')
                && item.getAttribute('aria-disabled') !== 'true'
            );
        }

        function showContextMenuAt(target, clientX, clientY, nodeData) {
            contextMenuTarget = nodeData;
            contextMenuReturnFocus = target && typeof target.focus === 'function'
                ? target
                : (document.activeElement instanceof HTMLElement ? document.activeElement : null);

            contextMenu.style.left = clientX + 'px';
            contextMenu.style.top = clientY + 'px';
            contextMenu.classList.add('visible');
            contextMenu.setAttribute('aria-hidden', 'false');

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

            // In Files mode, hide upstream/downstream for file nodes (graph already shows file deps)
            // In Tables mode, show upstream/downstream for table nodes
            if (upstreamItem && downstreamItem) {
                if (graphMode === 'files' && isFileNode) {
                    upstreamItem.style.display = 'none';
                    downstreamItem.style.display = 'none';
                } else {
                    upstreamItem.style.display = '';
                    upstreamItem.classList.remove('disabled');
                    upstreamItem.removeAttribute('aria-disabled');
                    upstreamItem.title = '';
                    downstreamItem.style.display = '';
                    downstreamItem.classList.remove('disabled');
                    downstreamItem.removeAttribute('aria-disabled');
                    downstreamItem.title = '';
                }
            }

            // Copy File Path — grey out when no filePath
            const copyPathItem = contextMenu.querySelector('[data-action="copyFilePath"]');
            if (copyPathItem) {
                if (nodeData.filePath) {
                    copyPathItem.classList.remove('disabled');
                    copyPathItem.removeAttribute('aria-disabled');
                    copyPathItem.style.display = '';
                } else {
                    copyPathItem.style.display = 'none';
                }
            }

            // Open File only makes sense for file nodes
            if (openFileItem) {
                if (isFileNode) {
                    openFileItem.classList.remove('disabled');
                    openFileItem.removeAttribute('aria-disabled');
                    openFileItem.style.display = '';
                } else {
                    openFileItem.style.display = 'none';
                }
            }

            // Analyze Impact — only for table/view nodes (not file or external)
            const impactItem = contextMenu.querySelector('[data-action="analyzeImpact"]');
            if (impactItem) {
                const showImpact = nodeData.type === 'table' || nodeData.type === 'view' || nodeData.type === 'cte';
                impactItem.style.display = showImpact ? '' : 'none';
            }

            // Visualize Dependencies only makes sense for file nodes
            if (visualizeItem) {
                if (isFileNode) {
                    visualizeItem.classList.remove('disabled');
                    visualizeItem.removeAttribute('aria-disabled');
                    visualizeItem.style.display = '';
                } else {
                    visualizeItem.style.display = 'none';
                }
            }

            getEnabledContextMenuItems()[0]?.focus();
        }

        function showContextMenu(e, nodeData) {
            e.preventDefault();
            showContextMenuAt(e.target, e.clientX, e.clientY, nodeData);
        }

        function hideContextMenu(restoreFocus = false) {
            contextMenu?.classList.remove('visible');
            contextMenu?.setAttribute('aria-hidden', 'true');
            contextMenuTarget = null;
            if (restoreFocus && contextMenuReturnFocus?.isConnected) {
                contextMenuReturnFocus.focus();
            }
            contextMenuReturnFocus = null;
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

        contextMenu?.addEventListener('keydown', (e) => {
            const items = getEnabledContextMenuItems();
            const activeIndex = items.indexOf(document.activeElement);
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                hideContextMenu(true);
                return;
            }
            if (e.key === 'Tab') {
                hideContextMenu();
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
                if (activeIndex >= 0) {
                    e.preventDefault();
                    items[activeIndex].click();
                }
                return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || items.length === 0) return;
            e.preventDefault();
            let nextIndex;
            if (e.key === 'Home') nextIndex = 0;
            else if (e.key === 'End') nextIndex = items.length - 1;
            else if (e.key === 'ArrowDown') nextIndex = (activeIndex + 1 + items.length) % items.length;
            else nextIndex = (activeIndex - 1 + items.length) % items.length;
            items[nextIndex].focus();
        });

        contextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!contextMenuTarget || item.classList.contains('disabled') || item.style.display === 'none') return;

                const action = item.getAttribute('data-action');
                const nodeName = contextMenuTarget.label || contextMenuTarget.id;
                const nodeType = contextMenuTarget.type || '';

                switch (action) {
                    case 'showUpstream':
                        switchToView('lineage', false, nodeName, nodeType);
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading upstream dependencies...</div></div>';
                        if (contextMenuTarget.type === 'file') {
                            postWorkspaceMessage({
                                command: 'getUpstream',
                                nodeType: 'file',
                                filePath: contextMenuTarget.filePath,
                                depth: lineageDepth
                            });
                        } else {
                            postWorkspaceMessage({
                                command: 'getUpstream',
                                nodeId: contextMenuTarget.id,
                                depth: lineageDepth
                            });
                        }
                        break;
                    case 'showDownstream':
                        switchToView('lineage', false, nodeName, nodeType);
                        if (lineageTitle) lineageTitle.textContent = 'Downstream of ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading downstream dependencies...</div></div>';
                        if (contextMenuTarget.type === 'file') {
                            postWorkspaceMessage({
                                command: 'getDownstream',
                                nodeType: 'file',
                                filePath: contextMenuTarget.filePath,
                                depth: lineageDepth
                            });
                        } else {
                            postWorkspaceMessage({
                                command: 'getDownstream',
                                nodeId: contextMenuTarget.id,
                                depth: lineageDepth
                            });
                        }
                        break;
                    case 'analyzeImpact':
                        switchToView('impact', false, nodeName, nodeType);
                        if (lineageTitle) lineageTitle.textContent = 'Impact Analysis: ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Analyzing impact...</div></div>';
                        var impactType = contextMenuTarget.type === 'view' ? 'view' : 'table';
                        clearPersistedImpactResult();
                        postWorkspaceMessage({
                            command: 'analyzeImpact',
                            type: impactType,
                            name: nodeName,
                            nodeId: contextMenuTarget.id,
                            changeType: 'modify'
                        });
                        break;
                    case 'exploreTable':
                        switchToView('lineage', false, nodeName, nodeType);
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">Loading table details...</div></div>';
                        lineageDetailView = true;
                        updateBackButtonText();
                        postWorkspaceMessage({
                            command: 'exploreTable',
                            tableName: nodeName,
                            nodeId: contextMenuTarget.id || ''
                        });
                        break;
                    case 'copyName':
                        navigator.clipboard.writeText(nodeName).catch(() => {});
                        break;
                    case 'copyFilePath':
                        if (contextMenuTarget.filePath) {
                            navigator.clipboard.writeText(contextMenuTarget.filePath).catch(() => {});
                        }
                        break;
                    case 'copyConnections': {
                        const nodeId = contextMenuTarget.id || '';
                        const neighbors = typeof getNeighbors === 'function' ? getNeighbors(nodeId) : { upstream: new Set(), downstream: new Set() };
                        const upLabels = Array.from(neighbors.upstream).map(id => typeof getNodeLabel === 'function' ? getNodeLabel(id) : id);
                        const downLabels = Array.from(neighbors.downstream).map(id => typeof getNodeLabel === 'function' ? getNodeLabel(id) : id);
                        const parts = [nodeName];
                        if (upLabels.length > 0) {
                            parts.push(upLabels.length + ' upstream: [' + upLabels.join(', ') + ']');
                        } else {
                            parts.push('0 upstream');
                        }
                        if (downLabels.length > 0) {
                            parts.push(downLabels.length + ' downstream: [' + downLabels.join(', ') + ']');
                        } else {
                            parts.push('0 downstream');
                        }
                        navigator.clipboard.writeText(parts.join(' → ')).catch(() => {});
                        break;
                    }
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
                    case 'exportLineage':
                        if (contextMenuTarget.id) {
                            vscode.postMessage({
                                command: 'exportNodeLineage',
                                nodeId: contextMenuTarget.id,
                                nodeLabel: nodeName,
                                nodeType: nodeType
                            });
                        }
                        break;
                }
                hideContextMenu(true);
            });
        });
    `;
}
