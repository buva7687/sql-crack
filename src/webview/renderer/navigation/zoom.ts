// Zoom and view navigation utilities

import { FlowNode, FlowEdge, FocusMode } from '../../types';
import { state, svg, mainGroup, currentNodes, currentEdges } from '../state';
import { updateTransform, clearFocusMode } from './transform';
import { selectNode } from './selection';

/**
 * Recursively find all upstream nodes (nodes that feed INTO the target)
 * Upstream = edges where edge.target === nodeId (find edge.source)
 */
function findAllUpstream(nodeId: string, edges: FlowEdge[], visited: Set<string> = new Set()): Set<string> {
    if (visited.has(nodeId)) return visited;
    visited.add(nodeId);

    for (const edge of edges) {
        if (edge.target === nodeId && !visited.has(edge.source)) {
            findAllUpstream(edge.source, edges, visited);
        }
    }
    return visited;
}

/**
 * Recursively find all downstream nodes (nodes that the source feeds INTO)
 * Downstream = edges where edge.source === nodeId (find edge.target)
 */
function findAllDownstream(nodeId: string, edges: FlowEdge[], visited: Set<string> = new Set()): Set<string> {
    if (visited.has(nodeId)) return visited;
    visited.add(nodeId);

    for (const edge of edges) {
        if (edge.source === nodeId && !visited.has(edge.target)) {
            findAllDownstream(edge.target, edges, visited);
        }
    }
    return visited;
}

/**
 * Get connected nodes based on focus mode
 */
export function getConnectedNodesByMode(nodeId: string, edges: FlowEdge[], mode: FocusMode): Set<string> {
    switch (mode) {
        case 'upstream':
            return findAllUpstream(nodeId, edges);
        case 'downstream':
            return findAllDownstream(nodeId, edges);
        case 'all':
        default:
            // Combine both directions
            const upstream = findAllUpstream(nodeId, edges);
            const downstream = findAllDownstream(nodeId, edges);
            return new Set([...upstream, ...downstream]);
    }
}

/**
 * Set the focus mode and re-apply zoom if a node is selected
 */
export function setFocusMode(mode: FocusMode): void {
    state.focusMode = mode;

    // If a node is currently zoomed, re-apply the zoom with new mode
    if (state.zoomedNodeId && state.selectedNodeId) {
        const node = currentNodes.find(n => n.id === state.selectedNodeId);
        if (node) {
            // Reset zoomed state to force re-zoom
            state.zoomedNodeId = null;
            zoomToNode(node);
        }
    }
}

/**
 * Get current focus mode
 */
export function getFocusMode(): FocusMode {
    return state.focusMode;
}

export function fitView(): void {
    if (!svg || currentNodes.length === 0) { return; }

    const rect = svg.getBoundingClientRect();
    const padding = 80;

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of currentNodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    }

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    // Account for panels
    const availableWidth = rect.width - 320;
    const availableHeight = rect.height - 100;

    // Calculate scale to fit
    const scaleX = (availableWidth - padding * 2) / graphWidth;
    const scaleY = (availableHeight - padding * 2) / graphHeight;
    state.scale = Math.min(scaleX, scaleY, 1.5);

    // Center the graph
    state.offsetX = (availableWidth - graphWidth * state.scale) / 2 - minX * state.scale + 50;
    state.offsetY = (availableHeight - graphHeight * state.scale) / 2 - minY * state.scale + 50;

    // Reset zoom state tracking when fitting view
    state.zoomedNodeId = null;
    state.previousZoomState = null;

    updateTransform();
}

export function zoomToNode(node: FlowNode): void {
    if (!svg || !mainGroup) { return; }

    // Simple toggle behavior: if already zoomed to any node, restore to fit view
    if (state.zoomedNodeId !== null) {
        // Show all nodes and edges again
        const allNodes = mainGroup.querySelectorAll('.node');
        allNodes.forEach(nodeEl => {
            (nodeEl as SVGGElement).style.display = '';
            (nodeEl as SVGGElement).style.opacity = '1';
        });
        const allEdges = mainGroup.querySelectorAll('.edge');
        allEdges.forEach(edgeEl => {
            (edgeEl as SVGPathElement).style.display = '';
            (edgeEl as SVGPathElement).style.opacity = '1';
        });

        // Clear focus mode and restore to fit view (default state)
        clearFocusMode();
        state.focusModeEnabled = false;
        fitView();
        return;
    }

    // Save current state before zooming (only if not already saved)
    // This preserves the original fit view state so we can restore to it later
    if (!state.previousZoomState) {
        state.previousZoomState = {
            scale: state.scale,
            offsetX: state.offsetX,
            offsetY: state.offsetY
        };
    }

    // Select the node first
    selectNode(node.id);

    // Get connected nodes based on focus mode (recursive traversal)
    const connectedNodes = getConnectedNodesByMode(node.id, currentEdges, state.focusMode);

    // Hide all nodes and edges that are not connected
    const allNodes = mainGroup.querySelectorAll('.node');
    allNodes.forEach(nodeEl => {
        const id = nodeEl.getAttribute('data-id');
        if (id && !connectedNodes.has(id)) {
            (nodeEl as SVGGElement).style.display = 'none';
        } else {
            (nodeEl as SVGGElement).style.display = '';
            (nodeEl as SVGGElement).style.opacity = '1';
        }
    });

    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        if (source && target && connectedNodes.has(source) && connectedNodes.has(target)) {
            (edgeEl as SVGPathElement).style.display = '';
            (edgeEl as SVGPathElement).style.opacity = '1';
        } else {
            (edgeEl as SVGPathElement).style.display = 'none';
        }
    });

    // Calculate bounds of visible nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const visibleNodes = currentNodes.filter(n => connectedNodes.has(n.id));
    for (const n of visibleNodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
    }

    // If only one node, use its bounds with some padding
    if (visibleNodes.length === 1) {
        const padding = 100;
        minX = node.x - padding;
        minY = node.y - padding;
        maxX = node.x + node.width + padding;
        maxY = node.y + node.height + padding;
    }

    // Calculate zoom to fit the visible nodes in the viewport
    const rect = svg.getBoundingClientRect();
    const availableWidth = rect.width - 320; // Account for panels
    const availableHeight = rect.height - 100;
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    const scaleX = (availableWidth * 0.8) / graphWidth; // Use 80% of available space
    const scaleY = (availableHeight * 0.8) / graphHeight;
    const targetScale = Math.min(scaleX, scaleY, 5.0); // Cap at 5x zoom

    // Center the visible nodes
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    state.scale = targetScale;
    state.offsetX = availableWidth / 2 - centerX * state.scale + 50;
    state.offsetY = availableHeight / 2 - centerY * state.scale + 50;
    state.zoomedNodeId = node.id;

    updateTransform();
}

export function zoomIn(): void {
    state.scale = Math.min(state.scale * 1.2, 3);
    updateTransform();
}

export function zoomOut(): void {
    state.scale = Math.max(state.scale / 1.2, 0.2);
    updateTransform();
}

export function resetView(): void {
    fitView();
}
