/**
 * Pure computation functions extracted from DOM-dependent rendering modules.
 *
 * These functions perform geometry, layout, and scoring calculations with
 * zero DOM access — they can be tested directly in Jest without mocking.
 */

import { FlowEdge, FlowNode, LayoutType } from '../types';

// ============================================================
// Edge Path Calculation  (from edgeRenderer.ts)
// ============================================================

/**
 * Calculate SVG path `d` attribute for an edge between two nodes.
 *
 * Layout-aware: horizontal uses horizontal Bézier, vertical/compact uses
 * vertical Bézier, force/radial uses angle-based quadratic curve.
 */
export function calculateEdgePath(sourceNode: FlowNode, targetNode: FlowNode, layoutType: LayoutType): string {
    if (layoutType === 'horizontal') {
        const sx = sourceNode.x + sourceNode.width;
        const sy = sourceNode.y + sourceNode.height / 2;
        const tx = targetNode.x;
        const ty = targetNode.y + targetNode.height / 2;
        const midX = (sx + tx) / 2;
        return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
    } else if (layoutType === 'force' || layoutType === 'radial') {
        const sourceCenterX = sourceNode.x + sourceNode.width / 2;
        const sourceCenterY = sourceNode.y + sourceNode.height / 2;
        const targetCenterX = targetNode.x + targetNode.width / 2;
        const targetCenterY = targetNode.y + targetNode.height / 2;

        const angle = Math.atan2(targetCenterY - sourceCenterY, targetCenterX - sourceCenterX);

        let sx: number, sy: number, tx: number, ty: number;

        if (Math.abs(angle) < Math.PI / 4) {
            sx = sourceNode.x + sourceNode.width;
            sy = sourceCenterY;
            tx = targetNode.x;
            ty = targetCenterY;
        } else if (Math.abs(angle) > 3 * Math.PI / 4) {
            sx = sourceNode.x;
            sy = sourceCenterY;
            tx = targetNode.x + targetNode.width;
            ty = targetCenterY;
        } else if (angle > 0) {
            sx = sourceCenterX;
            sy = sourceNode.y + sourceNode.height;
            tx = targetCenterX;
            ty = targetNode.y;
        } else {
            sx = sourceCenterX;
            sy = sourceNode.y;
            tx = targetCenterX;
            ty = targetNode.y + targetNode.height;
        }

        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const curvature = Math.min(dist * 0.3, 50);

        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;
        const perpX = -dy / dist * curvature;
        const perpY = dx / dist * curvature;

        return `M ${sx} ${sy} Q ${midX + perpX} ${midY + perpY}, ${tx} ${ty}`;
    } else {
        // Vertical/compact
        const sx = sourceNode.x + sourceNode.width / 2;
        const sy = sourceNode.y + sourceNode.height;
        const tx = targetNode.x + targetNode.width / 2;
        const ty = targetNode.y;
        const midY = (sy + ty) / 2;
        return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
    }
}

// ============================================================
// Badge Contrast  (from edgeRenderer.ts)
// ============================================================

/**
 * Return a legible text color for a badge given its background hex or rgb().
 * Uses the W3C YIQ perceived-brightness formula.
 */
export function contrastTextForBadge(bg: string): string {
    let r = 0, g = 0, b = 0;
    if (bg.startsWith('#')) {
        const hex = bg.replace('#', '');
        const full = hex.length === 3
            ? hex.split('').map(c => c + c).join('')
            : hex;
        r = parseInt(full.substring(0, 2), 16);
        g = parseInt(full.substring(2, 4), 16);
        b = parseInt(full.substring(4, 6), 16);
    } else {
        const m = bg.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    }
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 160 ? '#1e293b' : '#ffffff';
}

// ============================================================
// Cloud Arrow Path  (from cloudPositioning.ts)
// ============================================================

/**
 * Compute the SVG path for the arrow connecting a cloud to its parent node.
 *
 * Uses angle-based quadrant selection for path direction, producing a cubic
 * Bézier curve from the cloud edge to the node edge.
 */
export function computeCloudArrowPath(
    nodeX: number,
    nodeY: number,
    nodeWidth: number,
    nodeHeight: number,
    cloudX: number,
    cloudY: number,
    cloudWidth: number,
    cloudHeight: number,
): string {
    const nodeCenterX = nodeX + nodeWidth / 2;
    const nodeCenterY = nodeY + nodeHeight / 2;
    const cloudCenterX = cloudX + cloudWidth / 2;
    const cloudCenterY = cloudY + cloudHeight / 2;

    const dx = nodeCenterX - cloudCenterX;
    const dy = nodeCenterY - cloudCenterY;
    const angle = Math.atan2(dy, dx);

    // Cloud-relative coordinates (cloudPositioning works in cloud-local space)
    const relNodeX = nodeX - cloudX;
    const relNodeY = nodeY - cloudY;
    const relNodeCenterY = nodeCenterY - cloudY;
    const relNodeCenterX = nodeCenterX - cloudX;

    if (angle > -Math.PI / 4 && angle <= Math.PI / 4) {
        // Node is to the right
        const arrowStartX = cloudWidth;
        const arrowStartY = cloudHeight / 2;
        const arrowEndX = relNodeX;
        const arrowEndY = relNodeCenterY;
        const midX = (arrowStartX + arrowEndX) / 2;
        return `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`;
    } else if (angle > Math.PI / 4 && angle <= (3 * Math.PI) / 4) {
        // Node is below
        const arrowStartX = cloudWidth / 2;
        const arrowStartY = cloudHeight;
        const arrowEndX = relNodeCenterX;
        const arrowEndY = relNodeY;
        const midY = (arrowStartY + arrowEndY) / 2;
        return `M ${arrowStartX} ${arrowStartY} C ${arrowStartX} ${midY}, ${arrowEndX} ${midY}, ${arrowEndX} ${arrowEndY}`;
    } else if (angle > (-3 * Math.PI) / 4 && angle <= -Math.PI / 4) {
        // Node is above
        const arrowStartX = cloudWidth / 2;
        const arrowStartY = 0;
        const arrowEndX = relNodeCenterX;
        const arrowEndY = relNodeY + nodeHeight;
        const midY = (arrowStartY + arrowEndY) / 2;
        return `M ${arrowStartX} ${arrowStartY} C ${arrowStartX} ${midY}, ${arrowEndX} ${midY}, ${arrowEndX} ${arrowEndY}`;
    } else {
        // Node is to the left
        const arrowStartX = 0;
        const arrowStartY = cloudHeight / 2;
        const arrowEndX = relNodeX + nodeWidth;
        const arrowEndY = relNodeCenterY;
        const midX = (arrowStartX + arrowEndX) / 2;
        return `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`;
    }
}

// ============================================================
// Query Depth / Complexity  (from features/queryComplexity.ts)
// ============================================================

/**
 * Calculate maximum depth of the query graph via reverse DFS from the result node.
 *
 * Uses per-node best-depth tracking instead of a simple visited set so that
 * reconverging DAGs (diamond shapes) report the true longest path.  A node
 * is only re-explored when reached at a greater depth than previously seen.
 * An `onStack` guard breaks cycles without suppressing longer paths.
 */
export function calculateQueryDepth(nodes: FlowNode[], edges: FlowEdge[]): number {
    const resultNode = nodes.find(node => node.type === 'result');
    if (!resultNode) {
        return 0;
    }

    const bestDepth = new Map<string, number>();
    const onStack = new Set<string>();
    let maxDepth = 0;

    const dfs = (nodeId: string, depth: number): void => {
        if (onStack.has(nodeId)) {
            return; // cycle guard
        }
        if ((bestDepth.get(nodeId) ?? -1) >= depth) {
            return; // already reached at equal or greater depth
        }
        bestDepth.set(nodeId, depth);
        onStack.add(nodeId);
        maxDepth = Math.max(maxDepth, depth);

        for (const edge of edges) {
            if (edge.target === nodeId) {
                dfs(edge.source, depth + 1);
            }
        }

        onStack.delete(nodeId);
    };

    dfs(resultNode.id, 0);
    return maxDepth;
}

/**
 * Compute query complexity info from graph structure.
 */
export function getQueryComplexityInfo(nodes: FlowNode[], edges: FlowEdge[]): {
    nodeCount: number;
    tableCount: number;
    depth: number;
    isComplex: boolean;
} {
    const tableCount = nodes.filter(node => node.type === 'table').length;
    const depth = calculateQueryDepth(nodes, edges);

    return {
        nodeCount: nodes.length,
        tableCount,
        depth,
        isComplex: nodes.length >= 8 || tableCount >= 5 || depth >= 3,
    };
}
