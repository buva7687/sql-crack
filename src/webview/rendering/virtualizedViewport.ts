import { EDGE_COLORS, UI_COLORS } from '../constants';
import { FlowEdge, FlowNode, LayoutType } from '../types';
import {
    VirtualizationResult,
    getViewportBounds,
    getVisibleElements,
} from '../virtualization';

interface UpdateVisibleNodesFeatureOptions {
    svg: SVGSVGElement | null;
    mainGroup: SVGGElement | null;
    renderNodes: FlowNode[];
    renderEdges: FlowEdge[];
    scale: number;
    offsetX: number;
    offsetY: number;
    renderedNodeIds: Set<string>;
    currentOffscreenIndicator: SVGGElement | null;
    isDarkTheme: boolean;
    renderNode: (node: FlowNode, parent: SVGGElement) => void;
    renderEdge: (edge: FlowEdge, parent: SVGGElement) => void;
    onResultUpdated: (result: VirtualizationResult) => void;
}

interface SetVirtualizationEnabledFeatureOptions {
    enabled: boolean;
    currentNodes: FlowNode[];
    currentEdges: FlowEdge[];
    mainGroup: SVGGElement | null;
    renderedNodeIds: Set<string>;
    currentOffscreenIndicator: SVGGElement | null;
    renderNode: (node: FlowNode, parent: SVGGElement) => void;
    renderEdge: (edge: FlowEdge, parent: SVGGElement) => void;
    onVirtualizedUpdate: () => void;
}

interface VirtualizationUpdateResult {
    offscreenIndicator: SVGGElement | null;
}

function buildOffscreenIndicators(
    result: VirtualizationResult,
    svg: SVGSVGElement,
    currentOffscreenIndicator: SVGGElement | null,
    isDarkTheme: boolean
): SVGGElement | null {
    currentOffscreenIndicator?.remove();

    const { offscreenCounts } = result;
    const hasOffscreen =
        offscreenCounts.top + offscreenCounts.bottom + offscreenCounts.left + offscreenCounts.right > 0;
    if (!hasOffscreen) {
        return null;
    }

    const nextIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nextIndicator.setAttribute('class', 'offscreen-indicators');
    nextIndicator.style.pointerEvents = 'none';

    const rect = svg.getBoundingClientRect();
    const fill = isDarkTheme ? UI_COLORS.backgroundDark : UI_COLORS.backgroundPanelLightSolid;
    const stroke = isDarkTheme ? UI_COLORS.borderMedium : 'rgba(148, 163, 184, 0.45)';
    const textColor = isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightDim;

    const indicatorStyle = `
        fill: ${fill};
        stroke: ${stroke};
        stroke-width: 1;
    `;
    const textStyle = `
        fill: ${textColor};
        font-size: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        text-anchor: middle;
        dominant-baseline: middle;
    `;

    const appendIndicator = (label: string, x: number, y: number, width: number, height: number): void => {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${x}, ${y})`);

        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(-width / 2));
        bg.setAttribute('y', String(-height / 2));
        bg.setAttribute('width', String(width));
        bg.setAttribute('height', String(height));
        bg.setAttribute('rx', '10');
        bg.setAttribute('style', indicatorStyle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('style', textStyle);
        text.textContent = label;

        group.appendChild(bg);
        group.appendChild(text);
        nextIndicator.appendChild(group);
    };

    if (offscreenCounts.top > 0) {
        appendIndicator(`↑ ${offscreenCounts.top}`, rect.width / 2, 20, 60, 20);
    }
    if (offscreenCounts.bottom > 0) {
        appendIndicator(`↓ ${offscreenCounts.bottom}`, rect.width / 2, rect.height - 20, 60, 20);
    }
    if (offscreenCounts.left > 0) {
        appendIndicator(`← ${offscreenCounts.left}`, 20, rect.height / 2, 40, 20);
    }
    if (offscreenCounts.right > 0) {
        appendIndicator(`→ ${offscreenCounts.right}`, rect.width - 20, rect.height / 2, 40, 20);
    }

    svg.appendChild(nextIndicator);
    return nextIndicator;
}

export function updateVisibleNodesFeature(
    options: UpdateVisibleNodesFeatureOptions
): VirtualizationUpdateResult {
    const {
        svg,
        mainGroup,
        renderNodes,
        renderEdges,
        scale,
        offsetX,
        offsetY,
        renderedNodeIds,
        currentOffscreenIndicator,
        isDarkTheme,
        renderNode,
        renderEdge,
        onResultUpdated,
    } = options;

    if (!svg || !mainGroup || renderNodes.length === 0) {
        return { offscreenIndicator: currentOffscreenIndicator };
    }

    const rect = svg.getBoundingClientRect();
    const bounds = getViewportBounds(rect.width, rect.height, scale, offsetX, offsetY);
    const result = getVisibleElements(renderNodes, renderEdges, bounds);
    onResultUpdated(result);

    const nodesGroup = mainGroup.querySelector('.nodes') as SVGGElement | null;
    const edgesGroup = mainGroup.querySelector('.edges') as SVGGElement | null;
    if (!nodesGroup || !edgesGroup) {
        return { offscreenIndicator: currentOffscreenIndicator };
    }

    const nodesToAdd = result.visibleNodes.filter(node => !renderedNodeIds.has(node.id));
    const nodeIdsToRemove = [...renderedNodeIds].filter(nodeId => !result.visibleNodeIds.has(nodeId));

    for (const nodeId of nodeIdsToRemove) {
        nodesGroup.querySelector(`[data-id="${nodeId}"]`)?.remove();
        renderedNodeIds.delete(nodeId);
    }

    for (const node of nodesToAdd) {
        renderNode(node, nodesGroup);
        renderedNodeIds.add(node.id);
    }

    if (nodesToAdd.length > 0 || nodeIdsToRemove.length > 0) {
        edgesGroup.innerHTML = '';
        for (const edge of result.visibleEdges) {
            renderEdge(edge, edgesGroup);
        }
    }

    const offscreenIndicator = buildOffscreenIndicators(result, svg, currentOffscreenIndicator, isDarkTheme);
    return { offscreenIndicator };
}

export function setVirtualizationEnabledFeature(
    options: SetVirtualizationEnabledFeatureOptions
): VirtualizationUpdateResult {
    const {
        enabled,
        currentNodes,
        currentEdges,
        mainGroup,
        renderedNodeIds,
        currentOffscreenIndicator,
        renderNode,
        renderEdge,
        onVirtualizedUpdate,
    } = options;

    if (currentNodes.length === 0 || !mainGroup) {
        return { offscreenIndicator: currentOffscreenIndicator };
    }

    const nodesGroup = mainGroup.querySelector('.nodes') as SVGGElement | null;
    const edgesGroup = mainGroup.querySelector('.edges') as SVGGElement | null;
    if (!nodesGroup || !edgesGroup) {
        return { offscreenIndicator: currentOffscreenIndicator };
    }

    if (!enabled) {
        for (const node of currentNodes) {
            if (!renderedNodeIds.has(node.id)) {
                renderNode(node, nodesGroup);
                renderedNodeIds.add(node.id);
            }
        }

        edgesGroup.innerHTML = '';
        for (const edge of currentEdges) {
            renderEdge(edge, edgesGroup);
        }

        currentOffscreenIndicator?.remove();
        return { offscreenIndicator: null };
    }

    onVirtualizedUpdate();
    return { offscreenIndicator: currentOffscreenIndicator };
}

export function updateNodeEdgesFeature(options: {
    mainGroup: SVGGElement | null;
    node: FlowNode;
    nodes: FlowNode[];
    layoutType: LayoutType;
    calculateEdgePath: (sourceNode: FlowNode, targetNode: FlowNode, layoutType: LayoutType) => string;
}): void {
    const { mainGroup, node, nodes, layoutType, calculateEdgePath } = options;
    if (!mainGroup) {
        return;
    }

    const edges = mainGroup.querySelectorAll(`.edge[data-source="${node.id}"], .edge[data-target="${node.id}"]`);
    edges.forEach(edgeEl => {
        const edgePath = edgeEl as SVGPathElement;
        const sourceId = edgePath.getAttribute('data-source');
        const targetId = edgePath.getAttribute('data-target');
        if (!sourceId || !targetId) {
            return;
        }

        const sourceNode = nodes.find(candidate => candidate.id === sourceId);
        const targetNode = nodes.find(candidate => candidate.id === targetId);
        if (!sourceNode || !targetNode) {
            return;
        }

        edgePath.setAttribute('d', calculateEdgePath(sourceNode, targetNode, layoutType));
        if (!edgePath.hasAttribute('stroke')) {
            edgePath.setAttribute('stroke', EDGE_COLORS.default);
        }
    });
}
