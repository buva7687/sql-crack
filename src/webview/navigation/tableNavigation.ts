import type {
    ColumnFlow,
    ColumnLineage,
    FlowEdge,
    FlowNode,
    OptimizationHint,
    ParseResult,
    QueryStats,
    ViewState,
} from '../types';
import type { NodeCluster } from '../clustering';

interface TableLookupResult {
    table: FlowNode;
    parent: FlowNode;
}

export interface NavigateToTableFeatureOptions {
    tableName: string;
    state: ViewState;
    currentNodes: FlowNode[];
    currentEdges: FlowEdge[];
    currentStats: QueryStats | null;
    currentHints: OptimizationHint[];
    currentSql: string;
    currentColumnLineage: ColumnLineage[];
    currentColumnFlows: ColumnFlow[];
    currentTableUsage: Map<string, number>;
    currentClusters: NodeCluster[];
    getClusterForNode: (nodeId: string, clusters: NodeCluster[]) => NodeCluster | undefined;
    toggleCluster: (cluster: NodeCluster, clusters: NodeCluster[]) => NodeCluster[];
    onSetClusters: (nextClusters: NodeCluster[]) => void;
    onRender: (result: ParseResult) => void;
    onSelectNode: (nodeId: string, options?: { skipNavigation?: boolean }) => void;
    onZoomToNode: (node: FlowNode) => void;
    onPulseNode: (nodeId: string) => void;
    onPulseNodeInCloud: (subNodeId: string, parentNodeId: string) => void;
}

function tableLabelMatches(node: FlowNode, lowerName: string): boolean {
    const label = node.label.toLowerCase();
    if (node.type === 'table') {
        return label === lowerName;
    }
    if (node.type === 'join') {
        return label === lowerName || label.endsWith(` ${lowerName}`);
    }
    return false;
}

function findTableInChildren(children: FlowNode[], container: FlowNode, lowerName: string): TableLookupResult | null {
    for (const child of children) {
        if (tableLabelMatches(child, lowerName)) {
            return { table: child, parent: container };
        }
        if ((child.type === 'cte' || child.type === 'subquery') && child.children && child.children.length > 0) {
            const found = findTableInChildren(child.children, child, lowerName);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function createCurrentParseResult(options: NavigateToTableFeatureOptions): ParseResult {
    return {
        nodes: options.currentNodes,
        edges: options.currentEdges,
        stats: options.currentStats!,
        hints: options.currentHints,
        sql: options.currentSql,
        columnLineage: options.currentColumnLineage,
        columnFlows: options.currentColumnFlows,
        tableUsage: options.currentTableUsage,
    };
}

function expandParentNode(parentNode: FlowNode): void {
    parentNode.expanded = true;
    if (parentNode.children) {
        parentNode.height = 70 + parentNode.children.length * 30;
    }
}

export function navigateToTableFeature(options: NavigateToTableFeatureOptions): void {
    if (!options.tableName) {
        return;
    }
    const lowerName = options.tableName.toLowerCase();

    let tableNode: FlowNode | undefined;
    let parentNode: FlowNode | undefined;

    for (const node of options.currentNodes) {
        if ((node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0) {
            const found = findTableInChildren(node.children, node, lowerName);
            if (found) {
                tableNode = found.table;
                parentNode = found.parent;
                break;
            }
        }
    }

    if (!tableNode) {
        tableNode = options.currentNodes.find((node) => node.type === 'table' && node.label.toLowerCase() === lowerName);
    }

    if (!parentNode && tableNode && tableNode.parentId) {
        parentNode = options.currentNodes.find((node) => node.id === tableNode!.parentId);
    }

    if (!tableNode) {
        return;
    }

    options.state.zoomedNodeId = null;

    const doExpandAndNavigate = (zoomToParent: boolean, subNodeIdToHighlight?: string): void => {
        options.onRender(createCurrentParseResult(options));
        requestAnimationFrame(() => {
            const targetNode = zoomToParent && parentNode ? parentNode : tableNode!;
            options.onSelectNode(targetNode.id, { skipNavigation: true });
            options.onZoomToNode(targetNode);
            if (zoomToParent && parentNode && subNodeIdToHighlight) {
                options.onPulseNodeInCloud(subNodeIdToHighlight, parentNode.id);
                return;
            }
            options.onPulseNode(targetNode.id);
        });
    };

    const nodeToShow = parentNode || tableNode;
    const cluster = options.getClusterForNode(nodeToShow.id, options.currentClusters);
    if (cluster && !cluster.expanded) {
        options.onSetClusters(options.toggleCluster(cluster, options.currentClusters));
        options.onRender(createCurrentParseResult(options));
        requestAnimationFrame(() => {
            if (parentNode && (parentNode.type === 'cte' || parentNode.type === 'subquery') && !parentNode.expanded) {
                expandParentNode(parentNode);
                doExpandAndNavigate(true, tableNode!.id);
                return;
            }
            options.onSelectNode(tableNode!.id, { skipNavigation: true });
            options.onZoomToNode(tableNode!);
            options.onPulseNode(tableNode!.id);
        });
        return;
    }

    if (parentNode && (parentNode.type === 'cte' || parentNode.type === 'subquery')) {
        const parentCluster = options.getClusterForNode(parentNode.id, options.currentClusters);
        if (parentCluster && !parentCluster.expanded) {
            options.onSetClusters(options.toggleCluster(parentCluster, options.currentClusters));
            options.onRender(createCurrentParseResult(options));
            requestAnimationFrame(() => {
                expandParentNode(parentNode!);
                doExpandAndNavigate(true, tableNode!.id);
            });
            return;
        }

        expandParentNode(parentNode);
        doExpandAndNavigate(true, tableNode.id);
        return;
    }

    options.onSelectNode(tableNode.id, { skipNavigation: true });
    options.onZoomToNode(tableNode);
    options.onPulseNode(tableNode.id);
}
