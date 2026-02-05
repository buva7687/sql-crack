// Graph layout using dagre

import dagre from 'dagre';
import { FlowNode, FlowEdge } from '../types';

export function layoutGraph(nodes: FlowNode[], edges: FlowEdge[], bottomUp: boolean = false): void {
    if (nodes.length === 0) { return; }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: bottomUp ? 'BT' : 'TB',
        nodesep: 60,
        ranksep: 80,
        marginx: 40,
        marginy: 40
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    for (const node of nodes) {
        g.setNode(node.id, { width: node.width, height: node.height });
    }

    // Add edges
    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    // Run layout
    dagre.layout(g);

    // Apply positions
    for (const node of nodes) {
        const layoutNode = g.node(node.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            node.x = layoutNode.x - node.width / 2;
            node.y = layoutNode.y - node.height / 2;
        }
    }
}
