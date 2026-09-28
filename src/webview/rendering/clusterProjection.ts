import {
    createClusters,
    NodeCluster,
    shouldCluster,
} from '../clustering';
import { FlowEdge, FlowNode } from '../types';
import { EXPANDABLE_NODE_HEIGHT, EXPANDABLE_NODE_WIDTH } from './expandableNodeConstants';

interface ApplyClusteringFeatureOptions {
    nodes: FlowNode[];
    edges: FlowEdge[];
    currentClusters: NodeCluster[];
    onClustersUpdated: (clusters: NodeCluster[], clusterNodeMap: Map<string, NodeCluster>) => void;
}

/** Keep dragged positions when a rerender recreates the same cluster projection. */
export function preserveProjectedNodePositions(
    nodes: FlowNode[],
    edges: FlowEdge[],
    previousNodes: FlowNode[],
    previousEdges: FlowEdge[]
): boolean {
    if (nodes.length !== previousNodes.length || edges.length !== previousEdges.length) {
        return false;
    }

    const previousById = new Map(previousNodes.map(node => [node.id, node]));
    const previousEdgeById = new Map(previousEdges.map(edge => [edge.id, edge]));
    if (nodes.some(node => !previousById.has(node.id)) || edges.some(edge => {
        const previous = previousEdgeById.get(edge.id);
        return !previous || previous.source !== edge.source || previous.target !== edge.target;
    })) {
        return false;
    }

    // Visible nodes are reused, but collapsed cluster nodes are freshly built
    // from their members' bounds and need their rendered positions restored.
    for (const node of nodes) {
        const previous = previousById.get(node.id)!;
        node.x = previous.x;
        node.y = previous.y;
    }
    return true;
}

export function preCalculateExpandableDimensionsFeature(nodes: FlowNode[]): void {
    for (const node of nodes) {
        if ((node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0) {
            node.width = EXPANDABLE_NODE_WIDTH;
            node.height = EXPANDABLE_NODE_HEIGHT;
        }
    }
}

export function applyClusteringFeature(
    options: ApplyClusteringFeatureOptions
): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const { nodes, edges, currentClusters, onClustersUpdated } = options;

    if (!shouldCluster(nodes.length)) {
        onClustersUpdated([], new Map());
        return { nodes, edges };
    }

    const baseClusters = createClusters(nodes);
    if (baseClusters.length === 0) {
        onClustersUpdated([], new Map());
        return { nodes, edges };
    }

    const previousById = new Map(currentClusters.map(cluster => [cluster.id, cluster]));
    const nextClusters = baseClusters.map(cluster => {
        const previous = previousById.get(cluster.id);
        return previous ? { ...cluster, expanded: previous.expanded } : cluster;
    });
    const clusterNodeMap = new Map(nextClusters.map(cluster => [cluster.id, cluster]));
    onClustersUpdated(nextClusters, clusterNodeMap);

    const collapsedClusters = nextClusters.filter(cluster => !cluster.expanded);
    if (collapsedClusters.length === 0) {
        return { nodes, edges };
    }

    const nodeToCluster = new Map<string, NodeCluster>();
    for (const cluster of collapsedClusters) {
        for (const nodeId of cluster.nodeIds) {
            nodeToCluster.set(nodeId, cluster);
        }
    }

    const visibleNodes = nodes.filter(node => !nodeToCluster.has(node.id));
    const clusterNodes: FlowNode[] = collapsedClusters.map(cluster => ({
        id: cluster.id,
        type: 'cluster',
        label: cluster.label,
        description: 'Click to expand',
        x: cluster.x,
        y: cluster.y,
        width: cluster.width,
        height: cluster.height,
    }));

    const edgeMap = new Map<string, FlowEdge>();
    for (const edge of edges) {
        const sourceCluster = nodeToCluster.get(edge.source);
        const targetCluster = nodeToCluster.get(edge.target);
        const source = sourceCluster ? sourceCluster.id : edge.source;
        const target = targetCluster ? targetCluster.id : edge.target;
        if (source === target) {
            continue;
        }

        const key = `${source}->${target}`;
        if (!edgeMap.has(key)) {
            edgeMap.set(key, {
                ...edge,
                id: `${edge.id}:${key}`,
                source,
                target,
            });
        }
    }

    return {
        nodes: [...visibleNodes, ...clusterNodes],
        edges: [...edgeMap.values()],
    };
}
