import { ParseResult, FlowEdge, FlowNode, CloudViewState } from '../types';
import { calculateStackedCloudOffsetsFeature } from '../rendering/cloudPositioning';

interface ToggleNodeCollapseFeatureOptions {
    nodeId: string;
    currentNodes: FlowNode[];
    createRenderResult: () => ParseResult;
    onRender: (result: ParseResult) => void;
}

interface ToggleExpandAllFeatureOptions {
    currentNodes: FlowNode[];
    currentEdges: FlowEdge[];
    cloudOffsets: Map<string, { offsetX: number; offsetY: number }>;
    cloudViewStates: Map<string, CloudViewState>;
    layoutSubflowNodesVertical: (children: FlowNode[], edges: FlowEdge[]) => { width: number; height: number };
    createRenderResult: () => ParseResult;
    onRender: (result: ParseResult) => void;
    wasHorizontalLayout: boolean;
    onSwitchToVerticalLayout: () => void;
    onFitView: () => void;
}

export function toggleNodeCollapseFeature(options: ToggleNodeCollapseFeatureOptions): void {
    const { nodeId, currentNodes, createRenderResult, onRender } = options;

    const node = currentNodes.find(candidate => candidate.id === nodeId);
    if (!node || !node.collapsible) {
        return;
    }

    node.expanded = !node.expanded;
    onRender(createRenderResult());
}

export function toggleExpandAllFeature(options: ToggleExpandAllFeatureOptions): void {
    const {
        currentNodes,
        currentEdges,
        cloudOffsets,
        cloudViewStates,
        layoutSubflowNodesVertical,
        createRenderResult,
        onRender,
        wasHorizontalLayout,
        onSwitchToVerticalLayout,
        onFitView,
    } = options;

    const expandableNodes = currentNodes.filter(
        node =>
            (node.type === 'cte' || node.type === 'subquery') &&
            node.collapsible &&
            node.children &&
            node.children.length > 0
    );
    if (expandableNodes.length === 0) {
        return;
    }

    const expandedCount = expandableNodes.filter(node => node.expanded).length;
    const shouldExpand = expandedCount < expandableNodes.length / 2;

    for (const node of expandableNodes) {
        node.expanded = shouldExpand;
        if (shouldExpand && !cloudViewStates.has(node.id)) {
            cloudViewStates.set(node.id, {
                scale: 1,
                offsetX: 0,
                offsetY: 0,
                isDragging: false,
                dragStartX: 0,
                dragStartY: 0,
            });
        }
    }

    if (shouldExpand) {
        const offsets = calculateStackedCloudOffsetsFeature({
            expandableNodes,
            currentEdges,
            layoutSubflowNodesVertical,
        });
        for (const offset of offsets) {
            cloudOffsets.set(offset.nodeId, { offsetX: offset.offsetX, offsetY: offset.offsetY });
        }
    } else {
        for (const node of expandableNodes) {
            cloudOffsets.delete(node.id);
        }
    }

    onRender(createRenderResult());
    if (wasHorizontalLayout) {
        onSwitchToVerticalLayout();
    }

    setTimeout(() => {
        onFitView();
    }, 100);
}
