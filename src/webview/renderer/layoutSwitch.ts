// Layout switcher - Toggles between vertical (top-to-bottom) and horizontal (left-to-right) layouts

import { layoutGraph } from '../parser/layout';
import { layoutGraphHorizontal } from '../parser/forceLayout';
import { LayoutType } from '../types/renderer';
import { state, currentNodes, currentEdges, svg } from './state';

/**
 * Switch between layout algorithms
 * @param layoutType - 'vertical' for dagre (top-to-bottom), 'horizontal' for dagre (left-to-right)
 */
export function switchLayout(layoutType: LayoutType): void {
    if (!currentNodes || currentNodes.length === 0) {
        return;
    }

    // Store current transform to preserve view after layout switch
    const currentScale = state.scale;
    const currentOffsetX = state.offsetX;
    const currentOffsetY = state.offsetY;

    // Re-run layout with current nodes/edges
    if (layoutType === 'horizontal') {
        layoutGraphHorizontal(currentNodes, currentEdges);
    } else {
        layoutGraph(currentNodes, currentEdges);
    }

    // Update state
    state.layoutType = layoutType;

    // Preserve view transform
    state.scale = currentScale;
    state.offsetX = currentOffsetX;
    state.offsetY = currentOffsetY;

    // Re-render with new positions
    const mainGroupElement = svg ? svg.querySelector('#main-group') as SVGGElement : null;
    if (mainGroupElement) {
        // Force re-render by updating node positions in DOM
        currentNodes.forEach(node => {
            const nodeElement = document.getElementById(`node-${node.id}`);
            if (nodeElement) {
                const group = nodeElement.querySelector('g');
                if (group) {
                    group.setAttribute('transform', `translate(${node.x}, ${node.y})`);
                }
            }
        });

        // Update edges
        currentEdges.forEach(edge => {
            const edgeElement = document.getElementById(`edge-${edge.source}-${edge.target}`);
            if (edgeElement) {
                // Recalculate edge path with new node positions
                const sourceNode = currentNodes.find(n => n.id === edge.source);
                const targetNode = currentNodes.find(n => n.id === edge.target);
                if (sourceNode && targetNode) {
                    const path = calculateEdgePath(sourceNode, targetNode, layoutType);
                    edgeElement.setAttribute('d', path);
                }
            }
        });
    }

    // Update minimap with new positions
    const { updateMinimap } = require('./index');
    if (updateMinimap) {
        updateMinimap();
    }
}

/**
 * Toggle between layouts
 * Cycles through vertical and horizontal
 */
export function toggleLayout(): void {
    const newLayout: LayoutType = state.layoutType === 'vertical' ? 'horizontal' : 'vertical';
    switchLayout(newLayout);
}

/**
 * Calculate SVG path for edge between two nodes
 */
function calculateEdgePath(sourceNode: any, targetNode: any, layoutType: LayoutType): string {
    if (layoutType === 'horizontal') {
        // For horizontal: curved lines from right to left
        const sx = sourceNode.x + sourceNode.width;
        const sy = sourceNode.y + sourceNode.height / 2;
        const tx = targetNode.x;
        const ty = targetNode.y + targetNode.height / 2;
        const midX = (sx + tx) / 2;
        return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
    } else {
        // For vertical: curved lines from bottom to top
        const sx = sourceNode.x + sourceNode.width / 2;
        const sy = sourceNode.y + sourceNode.height;
        const tx = targetNode.x + targetNode.width / 2;
        const ty = targetNode.y;
        const midY = (sy + ty) / 2;
        return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
    }
}
