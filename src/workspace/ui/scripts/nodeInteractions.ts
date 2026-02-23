export function getNodeInteractionsScriptFragment(): string {
    return `
        // ========== Node Interactions ==========
        if (svg) {
            svg.addEventListener('click', (e) => {
                var node = e.target.closest('.node');
                if (!node) return;

                updateSelectionPanel(node);
            });

            svg.addEventListener('dblclick', (e) => {
                var node = e.target.closest('.node');
                if (!node) return;

                var filePath = node.getAttribute('data-filepath');
                var nodeType = node.getAttribute('data-type') || '';
                if (filePath && nodeType === 'file') {
                    e.preventDefault();
                    e.stopPropagation();
                    openFile(filePath);
                } else {
                    // For table/view/CTE/external nodes, navigate to lineage view
                    e.preventDefault();
                    e.stopPropagation();
                    var nodeId = node.getAttribute('data-id');
                    var nodeLabel = node.getAttribute('data-label') || nodeId;
                    if (nodeId) {
                        if (typeof switchToView === 'function') {
                            switchToView('lineage', false, nodeLabel, nodeType);
                        }
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            nodeLabel: nodeLabel,
                            nodeType: nodeType,
                            depth: typeof lineageDepth !== 'undefined' ? lineageDepth : 5,
                            direction: 'both'
                        });
                    }
                }
            });

            function decodeTooltip(base64) {
                try { return atob(base64); } catch (e) { return null; }
            }

            svg.addEventListener('mouseover', (e) => {
                const edge = e.target.closest('.edge');
                if (edge) {
                    const base64 = edge.getAttribute('data-tooltip');
                    if (base64) {
                        const content = decodeTooltip(base64);
                        if (content) showTooltip(e, content);
                    }
                    return;
                }

                const node = e.target.closest('.node');
                if (node) {
                    const base64 = node.getAttribute('data-tooltip');
                    if (base64) {
                        const content = decodeTooltip(base64);
                        if (content) showTooltip(e, content);
                    }
                }
            });

            svg.addEventListener('mouseout', (e) => {
                const edge = e.target.closest('.edge');
                const node = e.target.closest('.node');
                if (edge || node) hideTooltip();
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
                    if (typeof updateEdgeSelectionPanel === 'function') {
                        updateEdgeSelectionPanel(edge);
                    }
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
