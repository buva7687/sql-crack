import type {
    FlowEdge,
    FlowNode,
    FocusMode,
    LayoutType,
    ViewState,
    ZoomState,
} from '../types';
import { getConnectedNodeIds, getCycledNode, getKeyboardNavigableNodes, getSiblingCycleTarget } from './keyboardNavigation';

interface NodeNavigationShared {
    nodes: FlowNode[];
    edges: FlowEdge[];
    state: ViewState;
}

export function getKeyboardNavigationNodesFeature(shared: NodeNavigationShared): FlowNode[] {
    return getKeyboardNavigableNodes({
        nodes: shared.nodes,
        edges: shared.edges,
        focusModeEnabled: shared.state.focusModeEnabled,
        focusMode: shared.state.focusMode,
        selectedNodeId: shared.state.selectedNodeId,
    });
}

interface ConnectedNodeOptions extends NodeNavigationShared {
    direction: 'upstream' | 'downstream';
    fromNodeId?: string;
    onMoveToNode: (node: FlowNode) => void;
}

export function navigateToConnectedNodeFeature(options: ConnectedNodeOptions): boolean {
    const { direction, fromNodeId, nodes, edges, state, onMoveToNode } = options;
    const sourceNodeId = fromNodeId || state.selectedNodeId;
    if (!sourceNodeId) {
        return false;
    }

    const selectedNode = nodes.find((node) => node.id === sourceNodeId);
    if (!selectedNode) {
        return false;
    }

    let connectedNodeIds: string[] = [];
    if (direction === 'upstream') {
        connectedNodeIds = edges.filter((edge) => edge.target === sourceNodeId).map((edge) => edge.source);
    } else {
        connectedNodeIds = edges.filter((edge) => edge.source === sourceNodeId).map((edge) => edge.target);
    }

    if (state.focusModeEnabled) {
        const visibleIds = new Set(getKeyboardNavigationNodesFeature(options).map((node) => node.id));
        connectedNodeIds = connectedNodeIds.filter((id) => visibleIds.has(id));
    }

    if (connectedNodeIds.length === 0) {
        return false;
    }

    const stateKey = `lastNav_${direction}_${sourceNodeId}`;
    const mutableState = state as ViewState & Record<string, unknown>;
    const lastIndex = (mutableState[stateKey] as number | undefined) ?? -1;
    const nextIndex = (lastIndex + 1) % connectedNodeIds.length;
    mutableState[stateKey] = nextIndex;

    const targetNode = nodes.find((node) => node.id === connectedNodeIds[nextIndex]);
    if (!targetNode) {
        return false;
    }

    onMoveToNode(targetNode);
    return true;
}

interface AdjacentNodeOptions extends NodeNavigationShared {
    currentNode: FlowNode;
    direction: 'next' | 'prev';
    onMoveToNode: (node: FlowNode) => void;
}

export function navigateToAdjacentNodeFeature(options: AdjacentNodeOptions): void {
    const { currentNode, direction, onMoveToNode } = options;
    const sortedNodes = getKeyboardNavigationNodesFeature(options);
    const targetNode = getCycledNode(sortedNodes, currentNode.id, direction);
    if (!targetNode) {
        return;
    }
    onMoveToNode(targetNode);
}

interface SiblingNodeOptions extends NodeNavigationShared {
    currentNode: FlowNode;
    direction: 'next' | 'prev';
    layoutType: LayoutType;
    onMoveToNode: (node: FlowNode) => void;
}

export function navigateToSiblingNodeFeature(options: SiblingNodeOptions): boolean {
    const { currentNode, direction, layoutType, onMoveToNode } = options;
    const targetNode = getSiblingCycleTarget({
        nodes: getKeyboardNavigationNodesFeature(options),
        currentNode,
        direction,
        layoutType,
    });
    if (!targetNode || targetNode.id === currentNode.id) {
        return false;
    }
    onMoveToNode(targetNode);
    return true;
}

interface ViewportVisibilityOptions {
    node: FlowNode;
    svg: SVGSVGElement | null;
    state: ViewState;
    margin?: number;
}

export function isNodeInViewportFeature(options: ViewportVisibilityOptions): boolean {
    const { node, svg, state, margin = 50 } = options;
    if (!svg) {
        return true;
    }

    const rect = svg.getBoundingClientRect();
    const nodeLeft = node.x * state.scale + state.offsetX;
    const nodeRight = (node.x + node.width) * state.scale + state.offsetX;
    const nodeTop = node.y * state.scale + state.offsetY;
    const nodeBottom = (node.y + node.height) * state.scale + state.offsetY;

    return nodeLeft >= -margin
        && nodeRight <= rect.width + margin
        && nodeTop >= -margin
        && nodeBottom <= rect.height + margin;
}

interface EnsureNodeVisibleOptions extends ViewportVisibilityOptions {
    onUpdateTransform: () => void;
}

export function ensureNodeVisibleFeature(options: EnsureNodeVisibleOptions): void {
    const { node, svg, state, onUpdateTransform } = options;
    if (!svg || isNodeInViewportFeature(options)) {
        return;
    }

    const rect = svg.getBoundingClientRect();
    const margin = 100;

    const nodeLeft = node.x * state.scale + state.offsetX;
    const nodeRight = (node.x + node.width) * state.scale + state.offsetX;
    const nodeTop = node.y * state.scale + state.offsetY;
    const nodeBottom = (node.y + node.height) * state.scale + state.offsetY;

    let deltaX = 0;
    let deltaY = 0;

    if (nodeRight > rect.width - margin) {
        deltaX = rect.width - margin - nodeRight;
    } else if (nodeLeft < margin) {
        deltaX = margin - nodeLeft;
    }

    if (nodeBottom > rect.height - margin) {
        deltaY = rect.height - margin - nodeBottom;
    } else if (nodeTop < margin) {
        deltaY = margin - nodeTop;
    }

    if (deltaX !== 0 || deltaY !== 0) {
        state.offsetX += deltaX;
        state.offsetY += deltaY;
        onUpdateTransform();
    }
}

interface CenterNodeOptions {
    node: FlowNode;
    svg: SVGSVGElement | null;
    state: ViewState;
    onUpdateTransform: () => void;
}

export function centerOnNodeFeature(options: CenterNodeOptions): void {
    const { node, svg, state, onUpdateTransform } = options;
    if (!svg) {
        return;
    }
    const rect = svg.getBoundingClientRect();
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    state.offsetX = rect.width / 2 - centerX * state.scale;
    state.offsetY = rect.height / 2 - centerY * state.scale;
    onUpdateTransform();
}

interface FitViewOptions {
    svg: SVGSVGElement | null;
    renderNodes: FlowNode[];
    currentNodes: FlowNode[];
    cloudOffsets: Map<string, { offsetX: number; offsetY: number }>;
    state: ViewState;
    onUpdateTransform: () => void;
    onUpdateZoomIndicator: () => void;
    onSetFitViewScale: (scale: number) => void;
    layoutSubflowNodesVertical: (children: FlowNode[], edges: FlowEdge[]) => { width: number; height: number };
}

export function fitViewFeature(options: FitViewOptions): void {
    const {
        svg,
        renderNodes,
        currentNodes,
        cloudOffsets,
        state,
        onUpdateTransform,
        onUpdateZoomIndicator,
        onSetFitViewScale,
        layoutSubflowNodesVertical,
    } = options;
    const nodesForFit = renderNodes.length > 0 ? renderNodes : currentNodes;
    if (!svg || nodesForFit.length === 0) {
        return;
    }

    const rect = svg.getBoundingClientRect();
    const padding = 80;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodesForFit) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);

        if (node.expanded && (node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0) {
            const cloudPadding = 15;
            const cloudGap = 30;
            const nodeHeight = 60;
            const childEdges = node.childEdges || [];
            const layoutSize = layoutSubflowNodesVertical(node.children, childEdges);
            const cloudWidth = layoutSize.width + cloudPadding * 2;
            const cloudHeight = layoutSize.height + cloudPadding * 2 + 30;
            const offset = cloudOffsets.get(node.id) || {
                offsetX: -cloudWidth - cloudGap,
                offsetY: -(cloudHeight - nodeHeight) / 2,
            };
            const cloudX = node.x + offset.offsetX;
            const cloudY = node.y + offset.offsetY;
            minX = Math.min(minX, cloudX);
            minY = Math.min(minY, cloudY);
            maxX = Math.max(maxX, cloudX + cloudWidth);
            maxY = Math.max(maxY, cloudY + cloudHeight);
        }
    }

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const availableWidth = Math.max(100, rect.width - 320);
    const availableHeight = Math.max(100, rect.height - 100);
    const scaleX = (availableWidth - padding * 2) / graphWidth;
    const scaleY = (availableHeight - padding * 2) / graphHeight;
    state.scale = Math.max(0.05, Math.min(scaleX, scaleY, 1.5));
    onSetFitViewScale(state.scale);

    state.offsetX = (availableWidth - graphWidth * state.scale) / 2 - minX * state.scale + 50;
    state.offsetY = (availableHeight - graphHeight * state.scale) / 2 - minY * state.scale + 50;
    state.zoomedNodeId = null;
    state.previousZoomState = null;

    onUpdateTransform();
    onUpdateZoomIndicator();
}

interface ZoomToNodeOptions {
    node: FlowNode;
    svg: SVGSVGElement | null;
    mainGroup: SVGGElement | null;
    currentNodes: FlowNode[];
    currentEdges: FlowEdge[];
    cloudOffsets: Map<string, { offsetX: number; offsetY: number }>;
    state: ViewState;
    fitViewScale: number;
    onClearFocusMode: () => void;
    onFitView: () => void;
    onSelectNode: (nodeId: string) => void;
    onUpdateTransform: () => void;
    onUpdateZoomIndicator: () => void;
}

export function zoomToNodeFeature(options: ZoomToNodeOptions): void {
    const {
        node,
        svg,
        mainGroup,
        currentNodes,
        currentEdges,
        cloudOffsets,
        state,
        fitViewScale,
        onClearFocusMode,
        onFitView,
        onSelectNode,
        onUpdateTransform,
        onUpdateZoomIndicator,
    } = options;
    if (!svg || !mainGroup) {
        return;
    }

    if (state.zoomedNodeId !== null) {
        mainGroup.querySelectorAll('.node').forEach((nodeEl) => {
            (nodeEl as SVGGElement).style.display = '';
            (nodeEl as SVGGElement).style.opacity = '1';
        });
        mainGroup.querySelectorAll('.edge').forEach((edgeEl) => {
            (edgeEl as SVGPathElement).style.display = '';
            (edgeEl as SVGPathElement).style.opacity = '1';
        });
        mainGroup.querySelectorAll('.cloud-container').forEach((cloudEl) => {
            (cloudEl as SVGGElement).style.display = '';
            (cloudEl as SVGGElement).style.opacity = '1';
        });

        onClearFocusMode();
        state.focusModeEnabled = false;
        onFitView();
        return;
    }

    if (!state.previousZoomState) {
        state.previousZoomState = {
            scale: state.scale,
            offsetX: state.offsetX,
            offsetY: state.offsetY,
        } satisfies ZoomState;
    }

    onSelectNode(node.id);

    const immediateNeighbors = new Set<string>([node.id]);
    for (const edge of currentEdges) {
        if (edge.target === node.id) {
            immediateNeighbors.add(edge.source);
        }
        if (edge.source === node.id) {
            immediateNeighbors.add(edge.target);
        }
    }

    mainGroup.querySelectorAll('.node').forEach((nodeEl) => {
        const id = nodeEl.getAttribute('data-id');
        if (id && !immediateNeighbors.has(id)) {
            (nodeEl as SVGGElement).style.display = 'none';
        } else {
            (nodeEl as SVGGElement).style.display = '';
            (nodeEl as SVGGElement).style.opacity = '1';
        }
    });

    mainGroup.querySelectorAll('.cloud-container').forEach((cloudEl) => {
        const nodeId = cloudEl.getAttribute('data-node-id');
        if (nodeId && immediateNeighbors.has(nodeId)) {
            (cloudEl as SVGGElement).style.display = '';
            (cloudEl as SVGGElement).style.opacity = '1';
        } else {
            (cloudEl as SVGGElement).style.display = 'none';
        }
    });

    mainGroup.querySelectorAll('.edge').forEach((edgeEl) => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        if (source && target && immediateNeighbors.has(source) && immediateNeighbors.has(target)) {
            (edgeEl as SVGPathElement).style.display = '';
            (edgeEl as SVGPathElement).style.opacity = '1';
        } else {
            (edgeEl as SVGPathElement).style.display = 'none';
        }
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const visibleNodes = currentNodes.filter((candidate) => immediateNeighbors.has(candidate.id));
    for (const visibleNode of visibleNodes) {
        minX = Math.min(minX, visibleNode.x);
        minY = Math.min(minY, visibleNode.y);
        maxX = Math.max(maxX, visibleNode.x + visibleNode.width);
        maxY = Math.max(maxY, visibleNode.y + visibleNode.height);

        if (visibleNode.expanded && (visibleNode.type === 'cte' || visibleNode.type === 'subquery') && visibleNode.children && visibleNode.children.length > 0) {
            const cloudPadding = 15;
            const cloudGap = 30;
            const nodeHeight = 60;
            let cloudWidth = 160;
            let cloudHeight = 150;
            if (visibleNode.children.length > 0) {
                cloudWidth = Math.max(200, visibleNode.children.length * 80);
                cloudHeight = Math.max(150, visibleNode.children.length * 50 + 50);
            }
            const offset = cloudOffsets.get(visibleNode.id) || {
                offsetX: -cloudWidth - cloudGap,
                offsetY: -(cloudHeight - nodeHeight) / 2,
            };
            const cloudX = visibleNode.x + offset.offsetX;
            const cloudY = visibleNode.y + offset.offsetY;
            minX = Math.min(minX, cloudX);
            minY = Math.min(minY, cloudY);
            maxX = Math.max(maxX, cloudX + cloudWidth);
            maxY = Math.max(maxY, cloudY + cloudHeight);
        }
    }

    const hasExpandedCloud = node.expanded
        && (node.type === 'cte' || node.type === 'subquery')
        && node.children
        && node.children.length > 0;
    if (visibleNodes.length === 1 && !hasExpandedCloud) {
        const padding = 220;
        minX = node.x - padding;
        minY = node.y - padding;
        maxX = node.x + node.width + padding;
        maxY = node.y + node.height + padding;
    }

    const rect = svg.getBoundingClientRect();
    const availableWidth = rect.width - 320;
    const availableHeight = rect.height - 100;
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const scaleX = (availableWidth * 0.8) / graphWidth;
    const scaleY = (availableHeight * 0.8) / graphHeight;
    const maxScaleAbsolute = 2.5;
    const maxScaleRelative = fitViewScale > 0 ? fitViewScale * 1.8 : maxScaleAbsolute;
    const targetScale = Math.min(scaleX, scaleY, maxScaleAbsolute, maxScaleRelative);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    state.scale = targetScale;
    state.offsetX = availableWidth / 2 - centerX * state.scale + 50;
    state.offsetY = availableHeight / 2 - centerY * state.scale + 50;
    state.zoomedNodeId = node.id;

    onUpdateTransform();
    onUpdateZoomIndicator();
}

export function getConnectedNodesFeature(nodeId: string, edges: FlowEdge[], mode: FocusMode): Set<string> {
    return getConnectedNodeIds(nodeId, edges, mode);
}
