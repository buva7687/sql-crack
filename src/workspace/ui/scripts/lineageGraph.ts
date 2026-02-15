/**
 * Script fragment: visual lineage graph interactions, minimap, and overlays.
 */
export function getLineageGraphScriptFragment(): string {
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
        let pendingLineageGraphMessage = null;
        let refreshLineageMinimapViewport = null;
        let lineageShortcutHandler = null;
        let lineageOverlayResizeHandler = null;
        const lineageLegendStorageKey = 'sqlCrack.workspace.lineageLegendVisible';

        function finishLineageSetup() {
            lineageSetupInProgress = false;
            if (!pendingLineageGraphMessage) {
                return;
            }

            const queued = pendingLineageGraphMessage;
            pendingLineageGraphMessage = null;
            processLineageGraphResult(queued);
        }

        function processLineageGraphResult(message) {
            if (lineageContent && message.data?.html) {
                lineageSetupInProgress = true;
                setSafeHtml(lineageContent, message.data.html);
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
                setupMinimap();
                initializeLineageLegendBar();
                // Defer queue release to the next paint cycle without a fixed timeout.
                requestAnimationFrame(() => requestAnimationFrame(finishLineageSetup));
            }
        }

        const columnTraceHintStorageKey = 'sqlCrack.workspace.columnTraceHintDismissed';
        let pendingColumnTraceHintNodeId = null;
        let columnTraceHintDismissed = false;
        try { columnTraceHintDismissed = localStorage.getItem(columnTraceHintStorageKey) === '1'; } catch (e) { window.debugLogging && console.debug('[clientScripts] localStorage read failed:', e); }

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
            refreshLineageMinimapViewport = null;

            function updateLineageTransform() {
                const currentGraphContainer = document.querySelector('#lineage-graph-container .lineage-graph-svg .lineage-graph-container');
                const currentZoomLevel = document.getElementById('lineage-zoom-level');
                if (!currentGraphContainer) return;
                currentGraphContainer.setAttribute('transform', 'translate(' + lineageOffsetX + ',' + lineageOffsetY + ') scale(' + lineageScale + ')');
                if (currentZoomLevel) {
                    currentZoomLevel.textContent = Math.round(lineageScale * 100) + '%';
                }
                if (typeof refreshLineageMinimapViewport === 'function') {
                    refreshLineageMinimapViewport();
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

            zoomFitBtn?.addEventListener('click', () => {
                fitToContainer();
                if (svg) {
                    const nodes = svg.querySelectorAll('.lineage-node');
                    if (nodes) clearLineageFocus(nodes);
                }
            });

            if (!svg || !graphContainer) return;

            requestAnimationFrame(() => {
                setTimeout(() => fitToContainer(true), prefersReducedMotion ? 0 : 100);
            });

            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                lineageScale = Math.max(0.2, Math.min(3, lineageScale * delta));
                updateLineageTransform();
            }, { passive: false });

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

            function getColumnRows() {
                return Array.from(svg.querySelectorAll('.column-row'));
            }

            function triggerColumnTraceFromRow(row) {
                const nodeEl = row.closest('.lineage-node');
                const nodeId = nodeEl ? nodeEl.getAttribute('data-node-id') : null;
                const columnName = row.getAttribute('data-column-name');
                if (!nodeId || !columnName) return;
                vscode.postMessage({
                    command: 'selectColumn',
                    tableId: nodeId,
                    columnName: columnName
                });
            }

            function moveColumnRowFocus(fromRow, delta) {
                const rows = getColumnRows();
                if (rows.length === 0) return;
                const currentIndex = rows.indexOf(fromRow);
                if (currentIndex === -1) {
                    rows[0].focus();
                    return;
                }
                const nextIndex = (currentIndex + delta + rows.length) % rows.length;
                rows[nextIndex].focus();
            }

            const nodes = svg.querySelectorAll('.lineage-node');
            nodes.forEach(node => {
                const columnRows = node.querySelectorAll('.column-row');
                columnRows.forEach(row => {
                    row.setAttribute('tabindex', '0');
                    row.setAttribute('role', 'button');
                    row.setAttribute('focusable', 'true');
                    const columnName = row.getAttribute('data-column-name') || 'column';
                    const tableName = node.getAttribute('data-node-name') || 'table';
                    row.setAttribute('aria-label', tableName + '.' + columnName + '. Press Enter to trace lineage.');
                    row.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            triggerColumnTraceFromRow(row);
                            return;
                        }
                        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                            event.preventDefault();
                            event.stopPropagation();
                            moveColumnRowFocus(row, 1);
                            return;
                        }
                        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                            event.preventDefault();
                            event.stopPropagation();
                            moveColumnRowFocus(row, -1);
                        }
                    });
                });

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
                                maybeQueueColumnTraceHint(nodeId);
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
                    const nodeId = node.getAttribute('data-node-id');
                    const isExpanded = node.getAttribute('data-expanded') === 'true';
                    const columnCount = parseInt(node.getAttribute('data-column-count') || '0', 10);
                    if (nodeId && !isExpanded && columnCount > 0) {
                        maybeQueueColumnTraceHint(nodeId);
                        expandNodeWithColumns(nodeId);
                        return;
                    }
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
                            depth: lineageDepth,
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
            }, prefersReducedMotion ? 0 : 100);

            maybeRenderColumnTraceHint();
        }

        function syncLineageOverlayOffsets() {
            const container = document.getElementById('lineage-graph-container');
            const legendPanel = document.getElementById('lineage-legend');
            if (!container) return;

            if (!legendPanel || legendPanel.classList.contains('is-hidden')) {
                container.style.setProperty('--lineage-legend-height', '0px');
                return;
            }

            const measuredHeight = Math.ceil(legendPanel.getBoundingClientRect().height) || legendPanel.offsetHeight || 0;
            // Clamp to avoid pathological layout values pushing overlays too far upward.
            const legendHeight = Math.min(Math.max(measuredHeight, 0), 96);
            container.style.setProperty('--lineage-legend-height', legendHeight + 'px');
        }

        function setLineageLegendVisible(visible) {
            const legendPanel = document.getElementById('lineage-legend');
            if (!legendPanel) return;
            legendPanel.classList.toggle('is-hidden', !visible);
            legendPanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
            const legendToggleBtn = document.getElementById('lineage-legend-toggle');
            if (legendToggleBtn) {
                legendToggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
            }

            const container = document.getElementById('lineage-graph-container');
            if (container) {
                container.classList.toggle('lineage-legend-visible', visible);
            }
            syncLineageOverlayOffsets();
        }

        function toggleLineageLegendBar(show) {
            const legendPanel = document.getElementById('lineage-legend');
            if (!legendPanel) return;
            const nextVisible = typeof show === 'boolean' ? show : legendPanel.classList.contains('is-hidden');
            setLineageLegendVisible(nextVisible);
            try {
                localStorage.setItem(lineageLegendStorageKey, nextVisible ? '1' : '0');
            } catch (error) {
                // localStorage may be unavailable in restricted webview contexts
            }
        }

        function initializeLineageLegendBar() {
            const legendPanel = document.getElementById('lineage-legend');
            if (!legendPanel) return;

            let showLegend = true;
            try {
                const stored = localStorage.getItem(lineageLegendStorageKey);
                if (stored !== null) {
                    showLegend = stored === '1';
                }
            } catch (error) {
                // localStorage may be unavailable in restricted webview contexts
            }

            setLineageLegendVisible(showLegend);
            requestAnimationFrame(syncLineageOverlayOffsets);

            const dismissBtn = document.getElementById('legend-dismiss');
            dismissBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleLineageLegendBar(false);
            });
            const legendToggleBtn = document.getElementById('lineage-legend-toggle');
            legendToggleBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleLineageLegendBar();
            });

            if (lineageOverlayResizeHandler) {
                window.removeEventListener('resize', lineageOverlayResizeHandler);
            }
            lineageOverlayResizeHandler = () => syncLineageOverlayOffsets();
            window.addEventListener('resize', lineageOverlayResizeHandler);
        }

        function getLineageTypeIcon(type) {
            const icons = {
                table: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M2 6h12M2 9h12M6 6v7M10 6v7" stroke="currentColor" stroke-width="1"/></svg>',
                view: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/></svg>',
                cte: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1-3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13 3v2.5h-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                external: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 8h11M8 2.5c-2 2-2 9 0 11M8 2.5c2 2 2 9 0 11" stroke="currentColor" stroke-width="1"/></svg>'
            };
            return icons[type] || '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 5.5L8 2.5l5.5 3v7L8 15.5l-5.5-3v-7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        }

        function maybeQueueColumnTraceHint(nodeId) {
            if (!nodeId || columnTraceHintDismissed) return;
            pendingColumnTraceHintNodeId = nodeId;
        }

        function dismissColumnTraceHint() {
            columnTraceHintDismissed = true;
            pendingColumnTraceHintNodeId = null;
            try { localStorage.setItem(columnTraceHintStorageKey, '1'); } catch (e) { window.debugLogging && console.debug('[clientScripts] localStorage write failed:', e); }
            const hint = document.getElementById('column-trace-onboarding');
            if (hint) hint.remove();
        }

        function maybeRenderColumnTraceHint() {
            const existing = document.getElementById('column-trace-onboarding');
            if (existing) existing.remove();

            if (columnTraceHintDismissed) return;

            const container = document.getElementById('lineage-graph-container');
            if (!container) return;

            const nodeId = pendingColumnTraceHintNodeId || (lineageExpandedNodes && lineageExpandedNodes.size > 0 ? Array.from(lineageExpandedNodes)[0] : null);
            if (!nodeId) return;

            const node = container.querySelector('.lineage-node[data-node-id="' + CSS.escape(nodeId) + '"]');
            if (!node) return;

            const transform = node.getAttribute('transform') || '';
            const match = /translate\\(([-\\d.]+),\\s*([-\\d.]+)\\)/.exec(transform);
            const x = match ? parseFloat(match[1]) : 16;
            const y = match ? parseFloat(match[2]) : 16;

            const hint = document.createElement('div');
            hint.id = 'column-trace-onboarding';
            hint.className = 'column-trace-onboarding';
            hint.style.left = Math.max(8, x + 14) + 'px';
            hint.style.top = Math.max(8, y + 52) + 'px';
            hint.innerHTML = '<span class="hint-title">Column trace</span><span class="hint-body">Click a column to trace lineage across tables.</span><button class="hint-close" aria-label="Dismiss column trace hint">×</button>';
            container.appendChild(hint);

            const closeBtn = hint.querySelector('.hint-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    dismissColumnTraceHint();
                });
            }
        }

        function showLineageTooltip(e, node) {
            const tooltip = document.getElementById('lineage-tooltip');
            if (!tooltip) return;

            const nodeId = node.getAttribute('data-node-id') || '';
            const name = node.getAttribute('data-node-name') || '';
            const type = node.getAttribute('data-node-type') || '';
            const filePath = node.getAttribute('data-file-path') || '';
            const lineNumber = node.getAttribute('data-line-number') || '';
            const columnCount = parseInt(node.getAttribute('data-column-count') || '0', 10);
            const isExpanded = node.getAttribute('data-expanded') === 'true' || (nodeId && lineageExpandedNodes.has(nodeId));
            const hintText = !isExpanded && columnCount > 0
                ? 'Click to focus · Double-click to expand columns'
                : (isExpanded
                    ? 'Click a column to trace lineage · Right-click for actions'
                    : 'Click to focus · Double-click to open file');

            const iconEl = tooltip.querySelector('.tooltip-icon');
            if (iconEl) iconEl.innerHTML = getLineageTypeIcon(type);
            const nameEl = tooltip.querySelector('.tooltip-name');
            if (nameEl) nameEl.textContent = name;
            const typeEl = tooltip.querySelector('.type-value');
            if (typeEl) typeEl.textContent = type;
            const fileEl = tooltip.querySelector('.file-value');
            if (fileEl) fileEl.textContent = filePath ? basenameFromPath(filePath) : 'N/A';
            const lineEl = tooltip.querySelector('.line-value');
            if (lineEl) lineEl.textContent = lineNumber || 'N/A';
            const columnsEl = tooltip.querySelector('.columns-value');
            if (columnsEl) columnsEl.textContent = columnCount > 0 ? String(columnCount) : '-';
            const upstreamEl = tooltip.querySelector('.upstream-value');
            if (upstreamEl) upstreamEl.textContent = node.getAttribute('data-upstream-count') || '-';
            const downstreamEl = tooltip.querySelector('.downstream-value');
            if (downstreamEl) downstreamEl.textContent = node.getAttribute('data-downstream-count') || '-';
            const hintEl = tooltip.querySelector('.tooltip-hint');
            if (hintEl) hintEl.textContent = hintText;

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
            toast.style.cssText = 'position: fixed; top: 60px; right: 20px; background: var(--bg-secondary); color: var(--text-primary); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--accent); font-size: 12px; z-index: 9999; opacity: 0; transition: ' + (prefersReducedMotion ? 'none' : 'opacity 0.2s') + '; box-shadow: var(--shadow-md);';
            document.body.appendChild(toast);

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                setTimeout(() => {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), prefersReducedMotion ? 0 : 200);
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
                        vscode.postMessage({ command: 'getLineageGraph', nodeId, direction: 'upstream', depth: lineageDepth });
                    }
                },
                'focus-downstream': () => {
                    if (nodeId) {
                        vscode.postMessage({ command: 'getLineageGraph', nodeId, direction: 'downstream', depth: lineageDepth });
                    }
                },
                'expand-columns': () => {
                    if (nodeId) {
                        maybeQueueColumnTraceHint(nodeId);
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

            maybeQueueColumnTraceHint(nodeId);
            if (!lineageExpandedNodes) {
                lineageExpandedNodes = new Set();
            }
            lineageExpandedNodes.add(nodeId);

            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: lineageDepth,
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
                depth: lineageDepth,
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
            let firstExpandedNodeId = null;
            nodes.forEach(node => {
                const nodeId = node.getAttribute('data-node-id');
                if (nodeId) {
                    if (!firstExpandedNodeId) {
                        firstExpandedNodeId = nodeId;
                    }
                    lineageExpandedNodes.add(nodeId);
                }
            });

            if (firstExpandedNodeId) {
                maybeQueueColumnTraceHint(firstExpandedNodeId);
            }

            // Re-render with all nodes expanded
            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: lineageDepth,
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
                depth: lineageDepth,
                direction: lineageCurrentDirection,
                expandedNodes: []
            });
        }

        // Keyboard handler for lineage shortcuts (C/L + column navigation focus)
        if (lineageShortcutHandler) {
            document.removeEventListener('keydown', lineageShortcutHandler);
        }
        lineageShortcutHandler = (e) => {
            // Only respond if lineage graph is visible
            const lineageContainer = document.getElementById('lineage-graph-container');
            if (!lineageContainer || lineageContainer.offsetParent === null) return;

            // Ignore if typing in an input/select/textarea
            const target = e.target;
            const targetTag = target && target.tagName ? target.tagName : '';
            const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || (target && target.isContentEditable);
            if (isTyping) return;

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const activeEl = document.activeElement;
                const isColumnRowActive = activeEl && activeEl.classList && activeEl.classList.contains('column-row');
                if (!isColumnRowActive) {
                    const firstRow = lineageContainer.querySelector('.column-row');
                    if (firstRow) {
                        e.preventDefault();
                        firstRow.focus();
                        return;
                    }
                }
            }

            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                toggleAllColumns();
                return;
            }

            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                toggleLineageLegendBar();
            }
        };
        document.addEventListener('keydown', lineageShortcutHandler);

        // ========== Mini-map Functionality ==========
        function setupMinimap() {
            const minimap = document.getElementById('lineage-minimap');
            const minimapSvg = document.getElementById('minimap-svg');
            const minimapViewport = document.getElementById('minimap-viewport');
            const minimapContent = document.getElementById('minimap-content');
            const container = document.getElementById('lineage-graph-container');

            if (!minimap || !minimapSvg || !minimapViewport || !minimapContent || !container) {
                refreshLineageMinimapViewport = null;
                return;
            }

            let minimapDragging = false;

            // Get graph data for calculations
            const graphDataEl = document.getElementById('lineage-graph-data');
            let graphWidth = 800, graphHeight = 600;
            if (graphDataEl) {
                try {
                    const data = JSON.parse(graphDataEl.textContent || '{}');
                    graphWidth = data.width || 800;
                    graphHeight = data.height || 600;
                } catch (e) {
                    console.debug('[sql-crack] Failed to parse graph data for minimap:', e);
                }
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

                minimapViewport.setAttribute('x', String(visibleX));
                minimapViewport.setAttribute('y', String(visibleY));
                minimapViewport.setAttribute('width', String(visibleWidth));
                minimapViewport.setAttribute('height', String(visibleHeight));
            }

            refreshLineageMinimapViewport = updateMinimapViewport;

            function onMinimapMouseMove(e) {
                if (minimapDragging) {
                    panToMinimapPosition(e);
                }
            }

            function onMinimapMouseUp() {
                minimapDragging = false;
                document.removeEventListener('mousemove', onMinimapMouseMove);
                document.removeEventListener('mouseup', onMinimapMouseUp);
            }

            // Handle click on minimap to pan
            minimapContent.addEventListener('mousedown', (e) => {
                e.preventDefault();
                minimapDragging = true;
                document.addEventListener('mousemove', onMinimapMouseMove);
                document.addEventListener('mouseup', onMinimapMouseUp);
                panToMinimapPosition(e);
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

            // Hook into zoom/pan events to update minimap
            const mainSvg = container.querySelector('.lineage-graph-svg');
            if (mainSvg) {
                mainSvg.addEventListener('wheel', updateMinimapViewport);
                mainSvg.addEventListener('mouseup', updateMinimapViewport);
            }

            // Initial viewport update
            setTimeout(updateMinimapViewport, 200);
        }
    `;
}
