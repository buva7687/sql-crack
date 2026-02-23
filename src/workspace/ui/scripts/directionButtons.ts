/**
 * Script fragment: direction button wiring for lineage graph requests.
 */
export function getDirectionButtonsScriptFragment(): string {
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
                            depth: lineageDepth,
                            expandedNodes: lineageExpandedNodes ? Array.from(lineageExpandedNodes) : []
                        });
                    }
                });
            });
        }
    `;
}

