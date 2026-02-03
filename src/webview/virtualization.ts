/**
 * Virtualization utilities for viewport-based rendering
 *
 * Only renders nodes/edges that are visible in the current viewport,
 * dramatically improving performance for large graphs (500+ nodes).
 */

import { FlowNode, FlowEdge } from './types';

/**
 * Represents the visible area in graph coordinates
 */
export interface ViewportBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/**
 * Represents what's visible vs. off-screen
 */
export interface VirtualizationResult {
    visibleNodes: FlowNode[];
    visibleEdges: FlowEdge[];
    visibleNodeIds: Set<string>;
    offscreenCounts: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    };
    totalNodes: number;
    totalEdges: number;
}

/**
 * Configuration for virtualization behavior
 */
export interface VirtualizationConfig {
    /** Extra padding around viewport to pre-render nearby nodes (default: 100px) */
    padding: number;
    /** Minimum nodes before virtualization kicks in (default: 50) */
    minNodesForVirtualization: number;
    /** Whether virtualization is enabled (default: true) */
    enabled: boolean;
}

const DEFAULT_CONFIG: VirtualizationConfig = {
    padding: 100,
    minNodesForVirtualization: 50,
    enabled: true
};

let config: VirtualizationConfig = { ...DEFAULT_CONFIG };

/**
 * Update virtualization configuration
 */
export function setVirtualizationConfig(newConfig: Partial<VirtualizationConfig>): void {
    config = { ...config, ...newConfig };
}

/**
 * Get current virtualization configuration
 */
export function getVirtualizationConfig(): VirtualizationConfig {
    return { ...config };
}

/**
 * Calculate viewport bounds in graph coordinates
 *
 * @param containerWidth - Width of the SVG container in pixels
 * @param containerHeight - Height of the SVG container in pixels
 * @param scale - Current zoom scale
 * @param offsetX - Current X pan offset
 * @param offsetY - Current Y pan offset
 * @returns Bounds in graph coordinate space
 */
export function getViewportBounds(
    containerWidth: number,
    containerHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number
): ViewportBounds {
    // Convert screen coordinates to graph coordinates
    // Screen point (0, 0) -> Graph point (-offsetX/scale, -offsetY/scale)
    // Screen point (width, height) -> Graph point ((width-offsetX)/scale, (height-offsetY)/scale)

    const minX = -offsetX / scale;
    const minY = -offsetY / scale;
    const maxX = (containerWidth - offsetX) / scale;
    const maxY = (containerHeight - offsetY) / scale;

    return { minX, maxX, minY, maxY };
}

/**
 * Check if a node intersects with the viewport (including padding)
 */
export function isNodeInViewport(
    node: FlowNode,
    bounds: ViewportBounds,
    padding: number = config.padding
): boolean {
    const nodeRight = node.x + (node.width || 180);
    const nodeBottom = node.y + (node.height || 60);

    // Add padding to viewport bounds
    const paddedBounds = {
        minX: bounds.minX - padding,
        maxX: bounds.maxX + padding,
        minY: bounds.minY - padding,
        maxY: bounds.maxY + padding
    };

    // Check for intersection (AABB collision)
    return !(
        nodeRight < paddedBounds.minX ||
        node.x > paddedBounds.maxX ||
        nodeBottom < paddedBounds.minY ||
        node.y > paddedBounds.maxY
    );
}

/**
 * Determine which direction a node is off-screen
 */
function getOffscreenDirection(
    node: FlowNode,
    bounds: ViewportBounds
): 'top' | 'bottom' | 'left' | 'right' | null {
    const nodeCenterX = node.x + (node.width || 180) / 2;
    const nodeCenterY = node.y + (node.height || 60) / 2;

    // Check if node is in viewport (with no padding)
    if (nodeCenterX >= bounds.minX && nodeCenterX <= bounds.maxX &&
        nodeCenterY >= bounds.minY && nodeCenterY <= bounds.maxY) {
        return null;
    }

    // Determine primary direction based on which axis is further out
    const distanceLeft = bounds.minX - nodeCenterX;
    const distanceRight = nodeCenterX - bounds.maxX;
    const distanceTop = bounds.minY - nodeCenterY;
    const distanceBottom = nodeCenterY - bounds.maxY;

    const maxHorizontal = Math.max(distanceLeft, distanceRight);
    const maxVertical = Math.max(distanceTop, distanceBottom);

    if (maxHorizontal > maxVertical) {
        return distanceLeft > distanceRight ? 'left' : 'right';
    } else {
        return distanceTop > distanceBottom ? 'top' : 'bottom';
    }
}

/**
 * Get visible nodes and edges based on current viewport
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph
 * @param bounds - Current viewport bounds in graph coordinates
 * @returns Filtered nodes and edges, plus off-screen counts
 */
export function getVisibleElements(
    nodes: FlowNode[],
    edges: FlowEdge[],
    bounds: ViewportBounds
): VirtualizationResult {
    // Skip virtualization for small graphs
    if (!config.enabled || nodes.length < config.minNodesForVirtualization) {
        return {
            visibleNodes: nodes,
            visibleEdges: edges,
            visibleNodeIds: new Set(nodes.map(n => n.id)),
            offscreenCounts: { top: 0, bottom: 0, left: 0, right: 0 },
            totalNodes: nodes.length,
            totalEdges: edges.length
        };
    }

    const visibleNodes: FlowNode[] = [];
    const visibleNodeIds = new Set<string>();
    const offscreenCounts = { top: 0, bottom: 0, left: 0, right: 0 };

    // First pass: identify visible nodes
    for (const node of nodes) {
        if (isNodeInViewport(node, bounds)) {
            visibleNodes.push(node);
            visibleNodeIds.add(node.id);
        } else {
            // Count off-screen nodes by direction
            const direction = getOffscreenDirection(node, bounds);
            if (direction) {
                offscreenCounts[direction]++;
            }
        }
    }

    // Also include nodes that are connected to visible nodes (1-hop)
    // This ensures edges don't abruptly disappear at viewport edge
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
        if (visibleNodeIds.has(edge.source) || visibleNodeIds.has(edge.target)) {
            connectedNodeIds.add(edge.source);
            connectedNodeIds.add(edge.target);
        }
    }

    // Add connected nodes that aren't already visible
    for (const node of nodes) {
        if (connectedNodeIds.has(node.id) && !visibleNodeIds.has(node.id)) {
            visibleNodes.push(node);
            visibleNodeIds.add(node.id);
            // Adjust off-screen counts
            const direction = getOffscreenDirection(node, bounds);
            if (direction) {
                offscreenCounts[direction]--;
            }
        }
    }

    // Filter edges to only those between visible nodes
    const visibleEdges = edges.filter(edge =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    return {
        visibleNodes,
        visibleEdges,
        visibleNodeIds,
        offscreenCounts,
        totalNodes: nodes.length,
        totalEdges: edges.length
    };
}

/**
 * Create a debounced function that delays execution
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: unknown[]) => void>(
    fn: T,
    delay: number
): T & { cancel: () => void } {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debounced = ((...args: unknown[]) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    }) as T & { cancel: () => void };

    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

/**
 * Create a throttled function that executes at most once per interval
 *
 * @param fn - Function to throttle
 * @param interval - Minimum interval between executions in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => void>(
    fn: T,
    interval: number
): T {
    let lastExecuted = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return ((...args: unknown[]) => {
        const now = Date.now();
        const timeSinceLastExec = now - lastExecuted;

        if (timeSinceLastExec >= interval) {
            fn(...args);
            lastExecuted = now;
        } else if (!timeoutId) {
            timeoutId = setTimeout(() => {
                fn(...args);
                lastExecuted = Date.now();
                timeoutId = null;
            }, interval - timeSinceLastExec);
        }
    }) as T;
}

/**
 * Calculate graph bounds from nodes
 */
export function calculateGraphBounds(nodes: FlowNode[]): ViewportBounds {
    if (nodes.length === 0) {
        return { minX: 0, maxX: 400, minY: 0, maxY: 300 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x + (node.width || 180));
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y + (node.height || 60));
    }

    return { minX, maxX, minY, maxY };
}

/**
 * Check if virtualization should be active for the current graph
 */
export function shouldVirtualize(nodeCount: number): boolean {
    return config.enabled && nodeCount >= config.minNodesForVirtualization;
}
