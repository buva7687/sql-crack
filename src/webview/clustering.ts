/**
 * Node clustering utilities for organizing large graphs
 *
 * Groups related nodes into collapsible clusters to reduce visual complexity
 * and improve rendering performance.
 */

import { FlowNode, FlowEdge } from './types';

/**
 * Represents a cluster of related nodes
 */
export interface NodeCluster {
    id: string;
    label: string;
    type: ClusterType;
    nodeIds: string[];
    expanded: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
}

export type ClusterType = 'tables' | 'joins' | 'filters' | 'aggregates' | 'sorts' | 'ctes' | 'subqueries' | 'windows' | 'unions' | 'cases' | 'other';

/**
 * Configuration for clustering behavior
 */
export interface ClusteringConfig {
    /** Minimum nodes before auto-clustering kicks in */
    minNodesForClustering: number;
    /** Whether clustering is enabled */
    enabled: boolean;
    /** Default cluster state */
    defaultExpanded: boolean;
}

const DEFAULT_CONFIG: ClusteringConfig = {
    minNodesForClustering: 30,
    enabled: true,
    defaultExpanded: false
};

let config: ClusteringConfig = { ...DEFAULT_CONFIG };

/**
 * Update clustering configuration
 */
export function setClusteringConfig(newConfig: Partial<ClusteringConfig>): void {
    config = { ...config, ...newConfig };
}

/**
 * Get current clustering configuration
 */
export function getClusteringConfig(): ClusteringConfig {
    return { ...config };
}

/**
 * Get cluster type for a node
 */
function getClusterTypeForNode(node: FlowNode): ClusterType {
    switch (node.type) {
        case 'table':
            return 'tables';
        case 'join':
            return 'joins';
        case 'filter':
            return 'filters';
        case 'aggregate':
            return 'aggregates';
        case 'sort':
            return 'sorts';
        case 'cte':
            return 'ctes';
        case 'subquery':
            return 'subqueries';
        case 'window':
            return 'windows';
        case 'union':
            return 'unions';
        case 'case':
            return 'cases';
        default:
            return 'other';
    }
}

/**
 * Get display label for cluster type
 */
function getClusterLabel(type: ClusterType, count: number): string {
    const labels: Record<ClusterType, string> = {
        tables: `Tables (${count})`,
        joins: `Joins (${count})`,
        filters: `Filters (${count})`,
        aggregates: `Aggregates (${count})`,
        sorts: `Sorts (${count})`,
        ctes: `CTEs (${count})`,
        subqueries: `Subqueries (${count})`,
        windows: `Window Functions (${count})`,
        unions: `Unions (${count})`,
        cases: `Case Statements (${count})`,
        other: `Other (${count})`
    };
    return labels[type];
}

/**
 * Group nodes by their cluster type
 */
function groupNodesByType(nodes: FlowNode[]): Map<ClusterType, FlowNode[]> {
    const groups = new Map<ClusterType, FlowNode[]>();

    for (const node of nodes) {
        const type = getClusterTypeForNode(node);
        if (!groups.has(type)) {
            groups.set(type, []);
        }
        groups.get(type)!.push(node);
    }

    return groups;
}

/**
 * Calculate bounding box for a set of nodes
 */
function calculateClusterBounds(nodes: FlowNode[]): { x: number; y: number; width: number; height: number } {
    if (nodes.length === 0) {
        return { x: 0, y: 0, width: 200, height: 100 };
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

    return {
        x: minX,
        y: minY,
        width: maxX - minX + 40, // Add padding
        height: maxY - minY + 40
    };
}

/**
 * Create clusters from nodes grouped by type
 */
function createClustersFromGroups(
    groups: Map<ClusterType, FlowNode[]>,
    defaultExpanded: boolean
): NodeCluster[] {
    const clusters: NodeCluster[] = [];

    for (const [type, nodes] of groups.entries()) {
        if (nodes.length === 0) {
            continue;
        }

        const bounds = calculateClusterBounds(nodes);
        const cluster: NodeCluster = {
            id: `cluster-${type}`,
            label: getClusterLabel(type, nodes.length),
            type,
            nodeIds: nodes.map(n => n.id),
            expanded: defaultExpanded,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
        };

        clusters.push(cluster);
    }

    return clusters;
}

/**
 * Create clusters for nodes
 *
 * @param nodes - All nodes in the graph
 * @param defaultExpanded - Whether clusters should be expanded by default
 * @returns Array of node clusters
 */
export function createClusters(
    nodes: FlowNode[],
    defaultExpanded: boolean = config.defaultExpanded
): NodeCluster[] {
    if (!config.enabled || nodes.length < config.minNodesForClustering) {
        return [];
    }

    const groups = groupNodesByType(nodes);
    return createClustersFromGroups(groups, defaultExpanded);
}

/**
 * Filter nodes based on cluster expansion state
 *
 * @param nodes - All nodes in the graph
 * @param clusters - Active clusters
 * @returns Filtered nodes (expanded clusters show their nodes)
 */
export function filterNodesByClusters(
    nodes: FlowNode[],
    clusters: NodeCluster[]
): FlowNode[] {
    if (clusters.length === 0) {
        return nodes;
    }

    const visibleNodes: FlowNode[] = [];
    const expandedClusterNodeIds = new Set<string>();

    // Collect node IDs from expanded clusters
    for (const cluster of clusters) {
        if (cluster.expanded) {
            for (const nodeId of cluster.nodeIds) {
                expandedClusterNodeIds.add(nodeId);
            }
        }
    }

    // If a cluster is collapsed, hide its nodes
    for (const node of nodes) {
        const isInCluster = clusters.some(c => c.nodeIds.includes(node.id));
        if (!isInCluster || expandedClusterNodeIds.has(node.id)) {
            visibleNodes.push(node);
        }
    }

    return visibleNodes;
}

/**
 * Filter edges based on cluster expansion state
 *
 * @param edges - All edges in the graph
 * @param visibleNodes - Nodes that are currently visible
 * @returns Filtered edges (only edges between visible nodes)
 */
export function filterEdgesByClusters(
    edges: FlowEdge[],
    visibleNodes: FlowNode[]
): FlowEdge[] {
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    return edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
}

/**
 * Toggle cluster expansion state
 *
 * @param cluster - Cluster to toggle
 * @param clusters - All clusters
 * @returns Updated clusters array
 */
export function toggleCluster(cluster: NodeCluster, clusters: NodeCluster[]): NodeCluster[] {
    return clusters.map(c =>
        c.id === cluster.id ? { ...c, expanded: !c.expanded } : c
    );
}

/**
 * Expand all clusters
 *
 * @param clusters - All clusters
 * @returns Updated clusters array
 */
export function expandAllClusters(clusters: NodeCluster[]): NodeCluster[] {
    return clusters.map(c => ({ ...c, expanded: true }));
}

/**
 * Collapse all clusters
 *
 * @param clusters - All clusters
 * @returns Updated clusters array
 */
export function collapseAllClusters(clusters: NodeCluster[]): NodeCluster[] {
    return clusters.map(c => ({ ...c, expanded: false }));
}

/**
 * Check if clustering should be active for the current graph
 */
export function shouldCluster(nodeCount: number): boolean {
    return config.enabled && nodeCount >= config.minNodesForClustering;
}

/**
 * Get cluster for a specific node
 *
 * @param nodeId - Node ID to find cluster for
 * @param clusters - All clusters
 * @returns Cluster containing the node, or undefined
 */
export function getClusterForNode(nodeId: string, clusters: NodeCluster[]): NodeCluster | undefined {
    return clusters.find(c => c.nodeIds.includes(nodeId));
}

/**
 * Get color for cluster type
 */
export function getClusterColor(type: ClusterType): string {
    const colors: Record<ClusterType, string> = {
        tables: '#4CAF50',
        joins: '#2196F3',
        filters: '#FF9800',
        aggregates: '#9C27B0',
        sorts: '#00BCD4',
        ctes: '#FF5722',
        subqueries: '#795548',
        windows: '#607D8B',
        unions: '#E91E63',
        cases: '#3F51B5',
        other: '#9E9E9E'
    };
    return colors[type];
}
