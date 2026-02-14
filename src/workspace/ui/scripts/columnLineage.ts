/**
 * Script fragment: column lineage highlighting and edge overlays.
 */
export function getColumnLineageScriptFragment(): string {
    return `
        // ========== Column Lineage Highlighting ==========

        let selectedColumn = null;

        function handleColumnLineageResult(data) {
            if (!data) return;

            const { tableId, columnName, upstream, downstream } = data;

            selectedColumn = { tableId, columnName };
            window.__workspaceSelectedColumnLabel = columnName;
            if (typeof updateWorkspaceBreadcrumb === 'function') {
                updateWorkspaceBreadcrumb();
            }
            dismissColumnTraceHint();

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
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-opacity', '0.7');
            path.setAttribute('marker-end', 'url(#column-arrowhead-' + type + ')');

            container.appendChild(path);
        }

        function clearColumnHighlighting() {
            selectedColumn = null;
            window.__workspaceSelectedColumnLabel = '';

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
            if (typeof updateWorkspaceBreadcrumb === 'function') {
                updateWorkspaceBreadcrumb();
            }
        }

        function buildColumnFlowSummary(tableName, columnName, upstream, downstream) {
            const center = tableName + '.' + columnName;

            const firstUpstreamEdge = upstream && upstream[0] && upstream[0].edges && upstream[0].edges[0] ? upstream[0].edges[0] : null;
            const firstDownstreamEdge = downstream && downstream[0] && downstream[0].edges && downstream[0].edges[0] ? downstream[0].edges[0] : null;

            let upstreamSummary = null;
            if (firstUpstreamEdge && firstUpstreamEdge.metadata && firstUpstreamEdge.metadata.sourceColumn) {
                const upstreamNode = upstream[0].nodes && upstream[0].nodes.length > 0 ? upstream[0].nodes[0] : null;
                const upstreamTable = upstreamNode && upstreamNode.name ? upstreamNode.name : 'upstream';
                upstreamSummary = upstreamTable + '.' + firstUpstreamEdge.metadata.sourceColumn;
            }

            let downstreamSummary = null;
            if (firstDownstreamEdge && firstDownstreamEdge.metadata && firstDownstreamEdge.metadata.targetColumn) {
                const downstreamNodes = downstream[0].nodes || [];
                const downstreamNode = downstreamNodes.length > 0 ? downstreamNodes[downstreamNodes.length - 1] : null;
                const downstreamTable = downstreamNode && downstreamNode.name ? downstreamNode.name : 'downstream';
                downstreamSummary = downstreamTable + '.' + firstDownstreamEdge.metadata.targetColumn;
            }

            if (upstreamSummary && downstreamSummary) {
                return upstreamSummary + ' → ' + center + ' → ' + downstreamSummary;
            }
            if (upstreamSummary) {
                return upstreamSummary + ' → ' + center;
            }
            if (downstreamSummary) {
                return center + ' → ' + downstreamSummary;
            }
            return center;
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
            const flowSummary = buildColumnFlowSummary(tableName, columnName, upstream, downstream);

            infoPanel.innerHTML = '<div class="info-header">' +
                    '<span class="info-title">' + escapeHtml(tableName) + '.' + escapeHtml(columnName) + '</span>' +
                    '<button class="info-close" aria-label="Close column trace panel">×</button>' +
                '</div>' +
                '<div class="info-source">Source table: ' + escapeHtml(tableName) + '</div>' +
                '<div class="info-stats">' +
                    '<span class="stat upstream" title="Upstream sources"><svg width="12" height="12" viewBox="0 0 12 12" style="vertical-align:-1px"><path d="M6 1L2 7h8z" fill="currentColor"/></svg> ' + upstreamCount + ' sources</span>' +
                    '<span class="stat downstream" title="Downstream consumers"><svg width="12" height="12" viewBox="0 0 12 12" style="vertical-align:-1px"><path d="M6 11L2 5h8z" fill="currentColor"/></svg> ' + downstreamCount + ' consumers</span>' +
                '</div>' +
                '<div class="info-flow-summary" title="' + escapeHtml(flowSummary) + '">' + escapeHtml(flowSummary) + '</div>' +
                '<div class="info-actions"><button class="info-clear-btn" type="button">Clear trace</button></div>' +
                '<div class="info-hint">Click another column to trace its lineage, or click background to clear.</div>';

            const closeBtn = infoPanel.querySelector('.info-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => clearColumnHighlighting());
            }
            const clearBtn = infoPanel.querySelector('.info-clear-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => clearColumnHighlighting());
            }
            infoPanel.style.display = 'block';
        }

        function hideColumnLineageInfo() {
            const infoPanel = document.getElementById('column-lineage-info');
            if (infoPanel) {
                infoPanel.style.display = 'none';
            }
        }

        window.clearWorkspaceColumnTrace = clearColumnHighlighting;
    `;
}
