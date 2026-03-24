import { FlowEdge, FlowNode } from '../types';
import {
    EXPANDABLE_CLOUD_GAP,
    EXPANDABLE_CLOUD_HEADER_HEIGHT,
    EXPANDABLE_CLOUD_PADDING,
    EXPANDABLE_NODE_HEIGHT,
    EXPANDABLE_NODE_WIDTH,
} from './expandableNodeConstants';
import {
    calculateStackedCloudOffsets,
    type CloudOffsetInfo,
    type CalculateStackedCloudOffsetsOptions,
} from './computations';

// Re-export from computations for backwards compatibility
export { calculateStackedCloudOffsets, type CloudOffsetInfo, type CalculateStackedCloudOffsetsOptions };

export interface CloudRenderElements {
    group: SVGGElement;
    cloud: SVGRectElement;
    title: SVGTextElement;
    arrow: SVGPathElement;
    subflowGroup: SVGGElement;
    nestedSvg?: SVGSVGElement;
    closeButton?: SVGGElement;
}

interface UpdateCloudAndArrowFeatureOptions {
    node: FlowNode;
    cloudElements: Map<string, CloudRenderElements>;
    ensureCloudOffset: (
        nodeId: string,
        cloudWidth: number,
        cloudHeight: number,
        nodeHeight: number,
        cloudGap: number
    ) => { offsetX: number; offsetY: number };
    layoutSubflowNodesVertical: (children: FlowNode[], edges: FlowEdge[]) => { width: number; height: number };
}

interface CalculateStackedCloudOffsetsFeatureOptions {
    expandableNodes: FlowNode[];
    currentEdges: FlowEdge[];
    layoutSubflowNodesVertical: (children: FlowNode[], edges: FlowEdge[]) => { width: number; height: number };
}

/**
 * Update cloud container and arrow positions when a parent node or cloud is dragged.
 */
export function updateCloudAndArrowFeature(options: UpdateCloudAndArrowFeatureOptions): void {
    const { node, cloudElements, ensureCloudOffset, layoutSubflowNodesVertical } = options;

    const cloudData = cloudElements.get(node.id);
    if (!cloudData || !node.children || node.children.length === 0) {
        return;
    }

    const isExpanded = !node.collapsible || (node as { expanded?: boolean }).expanded !== false;
    if (!isExpanded) {
        return;
    }

    const nodeWidth = EXPANDABLE_NODE_WIDTH;
    const nodeHeight = EXPANDABLE_NODE_HEIGHT;
    const cloudGap = EXPANDABLE_CLOUD_GAP;
    const cloudPadding = EXPANDABLE_CLOUD_PADDING;

    const childEdges = node.childEdges || [];
    const layoutSize = layoutSubflowNodesVertical(node.children, childEdges);
    const cloudWidth = layoutSize.width + cloudPadding * 2;
    const cloudHeight = layoutSize.height + cloudPadding * 2 + EXPANDABLE_CLOUD_HEADER_HEIGHT;

    const offset = ensureCloudOffset(node.id, cloudWidth, cloudHeight, nodeHeight, cloudGap);
    const cloudX = node.x + offset.offsetX;
    const cloudY = node.y + offset.offsetY;
    cloudData.group.setAttribute('transform', `translate(${cloudX}, ${cloudY})`);

    const cloudCenterX = cloudX + cloudWidth / 2;
    const cloudCenterY = cloudY + cloudHeight / 2;
    const nodeCenterX = node.x + nodeWidth / 2;
    const nodeCenterY = node.y + nodeHeight / 2;

    const dx = nodeCenterX - cloudCenterX;
    const dy = nodeCenterY - cloudCenterY;
    const angle = Math.atan2(dy, dx);

    let pathD: string;

    if (angle > -Math.PI / 4 && angle <= Math.PI / 4) {
        const arrowStartX = cloudWidth;
        const arrowStartY = cloudHeight / 2;
        const arrowEndX = node.x - cloudX;
        const arrowEndY = nodeCenterY - cloudY;
        const midX = (arrowStartX + arrowEndX) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`;
    } else if (angle > Math.PI / 4 && angle <= (3 * Math.PI) / 4) {
        const arrowStartX = cloudWidth / 2;
        const arrowStartY = cloudHeight;
        const arrowEndX = nodeCenterX - cloudX;
        const arrowEndY = node.y - cloudY;
        const midY = (arrowStartY + arrowEndY) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${arrowStartX} ${midY}, ${arrowEndX} ${midY}, ${arrowEndX} ${arrowEndY}`;
    } else if (angle > (-3 * Math.PI) / 4 && angle <= -Math.PI / 4) {
        const arrowStartX = cloudWidth / 2;
        const arrowStartY = 0;
        const arrowEndX = nodeCenterX - cloudX;
        const arrowEndY = node.y + nodeHeight - cloudY;
        const midY = (arrowStartY + arrowEndY) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${arrowStartX} ${midY}, ${arrowEndX} ${midY}, ${arrowEndX} ${arrowEndY}`;
    } else {
        const arrowStartX = 0;
        const arrowStartY = cloudHeight / 2;
        const arrowEndX = node.x + nodeWidth - cloudX;
        const arrowEndY = nodeCenterY - cloudY;
        const midX = (arrowStartX + arrowEndX) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`;
    }

    cloudData.arrow.setAttribute('d', pathD);
}

/**
 * Calculate stacked cloud offsets to prevent overlap when expanding all.
 * Delegates to the pure computation in computations.ts.
 */
export function calculateStackedCloudOffsetsFeature(
    options: CalculateStackedCloudOffsetsFeatureOptions
): CloudOffsetInfo[] {
    return calculateStackedCloudOffsets(options);
}
