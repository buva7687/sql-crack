// Layout switcher - Supports multiple layout algorithms

import { layoutGraph } from '../parser/layout';
import { layoutGraphHorizontal, layoutGraphCompact, layoutGraphForce, layoutGraphRadial } from '../parser/forceLayout';
import { LayoutType } from '../types/renderer';
import { state, currentNodes, currentEdges, svg } from './state';

// Layout cycle order for toggle functionality
const LAYOUT_ORDER: LayoutType[] = ['vertical', 'horizontal', 'compact', 'force', 'radial'];

// Layout display names for UI
export const LAYOUT_NAMES: Record<LayoutType, string> = {
    vertical: 'Vertical',
    horizontal: 'Horizontal',
    compact: 'Compact',
    force: 'Force',
    radial: 'Radial',
};

/**
 * Switch between layout algorithms
 * @param layoutType - The layout algorithm to use
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
    switch (layoutType) {
        case 'horizontal':
            layoutGraphHorizontal(currentNodes, currentEdges);
            break;
        case 'compact':
            layoutGraphCompact(currentNodes, currentEdges);
            break;
        case 'force':
            layoutGraphForce(currentNodes, currentEdges);
            break;
        case 'radial':
            layoutGraphRadial(currentNodes, currentEdges);
            break;
        case 'vertical':
        default:
            layoutGraph(currentNodes, currentEdges);
            break;
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
 * Cycles through all available layouts
 */
export function toggleLayout(): void {
    const currentIndex = LAYOUT_ORDER.indexOf(state.layoutType || 'vertical');
    const nextIndex = (currentIndex + 1) % LAYOUT_ORDER.length;
    switchLayout(LAYOUT_ORDER[nextIndex]);
}

/**
 * Get current layout type
 */
export function getCurrentLayout(): LayoutType {
    return state.layoutType || 'vertical';
}

/**
 * Get all available layouts
 */
export function getAvailableLayouts(): LayoutType[] {
    return [...LAYOUT_ORDER];
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
    } else if (layoutType === 'force' || layoutType === 'radial') {
        // For force/radial: smart edge routing based on relative positions
        const sourceCenterX = sourceNode.x + sourceNode.width / 2;
        const sourceCenterY = sourceNode.y + sourceNode.height / 2;
        const targetCenterX = targetNode.x + targetNode.width / 2;
        const targetCenterY = targetNode.y + targetNode.height / 2;

        // Calculate angle between nodes to determine connection points
        const angle = Math.atan2(targetCenterY - sourceCenterY, targetCenterX - sourceCenterX);

        // Determine best connection points based on angle
        let sx: number, sy: number, tx: number, ty: number;

        if (Math.abs(angle) < Math.PI / 4) {
            // Target is to the right
            sx = sourceNode.x + sourceNode.width;
            sy = sourceCenterY;
            tx = targetNode.x;
            ty = targetCenterY;
        } else if (Math.abs(angle) > 3 * Math.PI / 4) {
            // Target is to the left
            sx = sourceNode.x;
            sy = sourceCenterY;
            tx = targetNode.x + targetNode.width;
            ty = targetCenterY;
        } else if (angle > 0) {
            // Target is below
            sx = sourceCenterX;
            sy = sourceNode.y + sourceNode.height;
            tx = targetCenterX;
            ty = targetNode.y;
        } else {
            // Target is above
            sx = sourceCenterX;
            sy = sourceNode.y;
            tx = targetCenterX;
            ty = targetNode.y + targetNode.height;
        }

        // Create curved path
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = Math.min(dist * 0.3, 50);

        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;

        // Perpendicular offset for curve
        const perpX = -dy / dist * curvature;
        const perpY = dx / dist * curvature;

        return `M ${sx} ${sy} Q ${midX + perpX} ${midY + perpY}, ${tx} ${ty}`;
    } else {
        // For vertical/compact: curved lines from bottom to top
        const sx = sourceNode.x + sourceNode.width / 2;
        const sy = sourceNode.y + sourceNode.height;
        const tx = targetNode.x + targetNode.width / 2;
        const ty = targetNode.y;
        const midY = (sy + ty) / 2;
        return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
    }
}
