import type { FlowEdge, FlowNode } from '../types/nodes';
import type { FocusMode, LayoutType } from '../types/renderer';

export function sortNodesByLayoutOrder(nodes: FlowNode[]): FlowNode[] {
    return [...nodes].sort((a, b) => {
        if (Math.abs(a.y - b.y) < 20) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });
}

function traverseUpstream(nodeId: string, edges: FlowEdge[], out: Set<string>): void {
    for (const edge of edges) {
        if (edge.target !== nodeId || out.has(edge.source)) { continue; }
        out.add(edge.source);
        traverseUpstream(edge.source, edges, out);
    }
}

function traverseDownstream(nodeId: string, edges: FlowEdge[], out: Set<string>): void {
    for (const edge of edges) {
        if (edge.source !== nodeId || out.has(edge.target)) { continue; }
        out.add(edge.target);
        traverseDownstream(edge.target, edges, out);
    }
}

export function getConnectedNodeIds(nodeId: string, edges: FlowEdge[], mode: FocusMode): Set<string> {
    const connected = new Set<string>();
    if (mode === 'upstream' || mode === 'all') {
        traverseUpstream(nodeId, edges, connected);
    }
    if (mode === 'downstream' || mode === 'all') {
        traverseDownstream(nodeId, edges, connected);
    }
    return connected;
}

export function getKeyboardNavigableNodes(options: {
    nodes: FlowNode[];
    edges: FlowEdge[];
    focusModeEnabled: boolean;
    focusMode: FocusMode;
    selectedNodeId: string | null;
}): FlowNode[] {
    const { nodes, edges, focusModeEnabled, focusMode, selectedNodeId } = options;

    if (!focusModeEnabled || !selectedNodeId) {
        return sortNodesByLayoutOrder(nodes);
    }

    const connectedIds = getConnectedNodeIds(selectedNodeId, edges, focusMode);
    connectedIds.add(selectedNodeId);

    return sortNodesByLayoutOrder(nodes.filter(node => connectedIds.has(node.id)));
}

export function getCycledNode(
    orderedNodes: FlowNode[],
    currentNodeId: string,
    direction: 'next' | 'prev'
): FlowNode | null {
    if (orderedNodes.length === 0) { return null; }

    const currentIndex = orderedNodes.findIndex(node => node.id === currentNodeId);
    if (currentIndex === -1) {
        return direction === 'next' ? orderedNodes[0] : orderedNodes[orderedNodes.length - 1];
    }

    const delta = direction === 'next' ? 1 : -1;
    const targetIndex = (currentIndex + delta + orderedNodes.length) % orderedNodes.length;
    return orderedNodes[targetIndex] ?? null;
}

function getCoordinateDepthBucket(node: FlowNode, layoutType: LayoutType): number {
    const depthAxis = layoutType === 'horizontal' ? node.x : node.y;
    const bucketSize = layoutType === 'horizontal' ? 80 : 60;
    return Math.round(depthAxis / bucketSize);
}

function getDepthBucket(node: FlowNode, layoutType: LayoutType): number {
    if (typeof node.depth === 'number') {
        return node.depth;
    }
    return getCoordinateDepthBucket(node, layoutType);
}

export function getSiblingNodes(
    nodes: FlowNode[],
    currentNode: FlowNode,
    layoutType: LayoutType,
): FlowNode[] {
    const currentDepth = getDepthBucket(currentNode, layoutType);
    const siblingAxis = layoutType === 'horizontal' ? 'y' : 'x';

    let siblings = nodes
        .filter(node => getDepthBucket(node, layoutType) === currentDepth)
        .sort((a, b) => {
            const aAxis = siblingAxis === 'x' ? a.x : a.y;
            const bAxis = siblingAxis === 'x' ? b.x : b.y;
            return aAxis - bAxis;
        });

    // Fallback to visual row/column matching when semantic depth is too strict.
    if (siblings.length <= 1 && typeof currentNode.depth === 'number') {
        const visualDepth = getCoordinateDepthBucket(currentNode, layoutType);
        siblings = nodes
            .filter(node => getCoordinateDepthBucket(node, layoutType) === visualDepth)
            .sort((a, b) => {
                const aAxis = siblingAxis === 'x' ? a.x : a.y;
                const bAxis = siblingAxis === 'x' ? b.x : b.y;
                return aAxis - bAxis;
            });
    }

    return siblings;
}

export function getSiblingCycleTarget(options: {
    nodes: FlowNode[];
    currentNode: FlowNode;
    direction: 'next' | 'prev';
    layoutType: LayoutType;
}): FlowNode | null {
    const { nodes, currentNode, direction, layoutType } = options;
    const siblings = getSiblingNodes(nodes, currentNode, layoutType);
    if (siblings.length === 0) { return null; }
    return getCycledNode(siblings, currentNode.id, direction);
}
