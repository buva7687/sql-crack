// Node selection and edge highlighting utilities

import { state, mainGroup, currentNodes, currentEdges, currentSql } from '../state';
import { centerOnNode } from './zoom';

// Callback functions to be set by the main renderer to avoid circular dependencies
let onUpdateDetailsPanel: ((nodeId: string | null) => void) | null = null;
let onUpdateBreadcrumb: ((nodeId: string | null) => void) | null = null;

export function setSelectionCallbacks(
    updateDetails: (nodeId: string | null) => void,
    updateBreadcrumb: (nodeId: string | null) => void
): void {
    onUpdateDetailsPanel = updateDetails;
    onUpdateBreadcrumb = updateBreadcrumb;
}

export function highlightConnectedEdges(nodeId: string, highlight: boolean): void {
    const edges = mainGroup?.querySelectorAll('.edge');
    edges?.forEach(edge => {
        const source = edge.getAttribute('data-source');
        const target = edge.getAttribute('data-target');
        if (source === nodeId || target === nodeId) {
            if (highlight) {
                edge.setAttribute('stroke', '#fbbf24');
                edge.setAttribute('stroke-width', '3');
                edge.setAttribute('marker-end', 'url(#arrowhead-highlight)');
            } else {
                edge.setAttribute('stroke', '#64748b');
                edge.setAttribute('stroke-width', '2');
                edge.setAttribute('marker-end', 'url(#arrowhead)');
            }
        }
    });
}

export function selectNode(nodeId: string | null, options?: { skipNavigation?: boolean }): void {
    state.selectedNodeId = nodeId;

    // Update visual selection
    const nodeGroups = mainGroup?.querySelectorAll('.node');
    nodeGroups?.forEach(g => {
        const rect = g.querySelector('.node-rect');
        const id = g.getAttribute('data-id');
        if (rect && id) {
            if (id === nodeId) {
                rect.setAttribute('stroke', '#fff');
                rect.setAttribute('stroke-width', '3');
                rect.setAttribute('filter', 'url(#glow)');
                highlightConnectedEdges(id, true);
            } else {
                rect.removeAttribute('stroke');
                rect.removeAttribute('stroke-width');
                rect.setAttribute('filter', 'url(#shadow)');
            }
        }
    });

    // Clear edge highlights if nothing selected
    if (!nodeId) {
        const edges = mainGroup?.querySelectorAll('.edge');
        edges?.forEach(edge => {
            edge.setAttribute('stroke', '#64748b');
            edge.setAttribute('stroke-width', '2');
            edge.setAttribute('marker-end', 'url(#arrowhead)');
        });
    }

    // Phase 1 Feature: Click Node → Jump to SQL
    // Navigate to the SQL definition when a node is clicked
    // Skip navigation when zooming/focusing to keep keyboard focus in webview
    if (nodeId && !options?.skipNavigation) {
        const node = currentNodes.find(n => n.id === nodeId);
        if (node && typeof window !== 'undefined') {
            const vscodeApi = (window as any).vscodeApi;
            if (vscodeApi && vscodeApi.postMessage) {
                // Try to find line number from node or search in SQL
                let lineNumber = node.startLine;

                // Fallback: If no line number assigned, search for table name in SQL
                // This handles cases where line number assignment might have failed
                if (!lineNumber && node.type === 'table' && currentSql) {
                    const tableName = node.label.toLowerCase();
                    const sqlLines = currentSql.split('\n');
                    for (let i = 0; i < sqlLines.length; i++) {
                        const line = sqlLines[i].toLowerCase();
                        // Look for table name as a word boundary match to avoid partial matches
                        if (line.match(new RegExp(`\\b${tableName}\\b`))) {
                            lineNumber = i + 1;
                            break;
                        }
                    }
                }

                if (lineNumber) {
                    console.log('Navigating to line', lineNumber, 'for node:', node.label, node.type);
                    vscodeApi.postMessage({
                        command: 'goToLine',
                        line: lineNumber
                    });
                }
            }
        }
    }

    // Update details panel
    if (onUpdateDetailsPanel) {
        onUpdateDetailsPanel(nodeId);
    }

    // Update breadcrumb navigation
    if (onUpdateBreadcrumb) {
        onUpdateBreadcrumb(nodeId);
    }
}

/**
 * Navigate to a connected node using arrow keys for accessibility
 * @param direction - 'upstream' (ArrowUp/Left) or 'downstream' (ArrowDown/Right)
 * @returns true if navigation occurred, false if no connected node found
 */
export function navigateToConnectedNode(direction: 'upstream' | 'downstream'): boolean {
    if (!state.selectedNodeId) { return false; }

    const selectedNode = currentNodes.find(n => n.id === state.selectedNodeId);
    if (!selectedNode) { return false; }

    // Find connected nodes based on direction
    let connectedNodeIds: string[] = [];

    if (direction === 'upstream') {
        // Find nodes that are sources (edges where selected node is target)
        connectedNodeIds = currentEdges
            .filter(e => e.target === state.selectedNodeId)
            .map(e => e.source);
    } else {
        // Find nodes that are targets (edges where selected node is source)
        connectedNodeIds = currentEdges
            .filter(e => e.source === state.selectedNodeId)
            .map(e => e.target);
    }

    if (connectedNodeIds.length === 0) { return false; }

    // If there are multiple connected nodes, cycle through them
    // Track the last visited index for this direction
    const stateKey = `lastNav_${direction}_${state.selectedNodeId}`;
    const lastIndex = (state as any)[stateKey] || 0;
    const nextIndex = (lastIndex + 1) % connectedNodeIds.length;
    (state as any)[stateKey] = nextIndex;

    // Navigate to the connected node
    const targetNodeId = connectedNodeIds[nextIndex > 0 ? nextIndex - 1 : connectedNodeIds.length - 1] || connectedNodeIds[0];
    const targetNode = currentNodes.find(n => n.id === targetNodeId);

    if (targetNode) {
        selectNode(targetNodeId, { skipNavigation: true });
        // Center on node without hiding others (don't use zoomToNode which has toggle behavior)
        centerOnNode(targetNode);
        return true;
    }

    return false;
}
