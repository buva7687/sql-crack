// Alternative layout algorithms
// Provides horizontal (left-to-right) layout as alternative to vertical (top-to-bottom)

import dagre from 'dagre';
import { FlowNode, FlowEdge } from '../types';

/**
 * Horizontal layout using dagre with left-to-right direction
 * This is deterministic and provides a clean alternative to the default top-to-bottom layout
 */
export function layoutGraphHorizontal(
    nodes: FlowNode[],
    edges: FlowEdge[]
): void {
    if (nodes.length === 0) { return; }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'LR',  // Left to Right (horizontal)
        nodesep: 50,    // Vertical spacing between nodes
        ranksep: 100,   // Horizontal spacing between ranks
        marginx: 20,
        marginy: 20
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to graph
    nodes.forEach(node => {
        g.setNode(node.id, { width: node.width, height: node.height });
    });

    // Add edges to graph
    edges.forEach(edge => {
        g.setEdge(edge.source, edge.target);
    });

    // Run dagre layout
    dagre.layout(g);

    // Apply positions to nodes
    nodes.forEach(node => {
        const nodeWithPos = g.node(node.id);
        if (nodeWithPos && nodeWithPos.x !== undefined && nodeWithPos.y !== undefined) {
            node.x = nodeWithPos.x - node.width / 2;
            node.y = nodeWithPos.y - node.height / 2;
        }
    });
}

/**
 * Calculate layout metrics for debugging/optimization
 */
export function getLayoutMetrics(nodes: FlowNode[], edges: FlowEdge[]): {
    nodeCount: number;
    edgeCount: number;
    averageConnections: number;
    maxConnections: number;
} {
    if (nodes.length === 0) {
        return { nodeCount: 0, edgeCount: 0, averageConnections: 0, maxConnections: 0 };
    }

    const connections = new Map<string, number>();
    nodes.forEach(n => connections.set(n.id, 0));
    edges.forEach(e => {
        connections.set(e.source, (connections.get(e.source) || 0) + 1);
        connections.set(e.target, (connections.get(e.target) || 0) + 1);
    });

    const connectionCounts = Array.from(connections.values());
    const avg = connectionCounts.reduce((a, b) => a + b, 0) / connectionCounts.length;
    const max = Math.max(...connectionCounts);

    return {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        averageConnections: avg,
        maxConnections: max
    };
}
