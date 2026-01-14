// Subflow layout utilities
// Note: Full implementation remains in renderer.ts for now.
// This module will be populated during incremental migration.

import dagre from 'dagre';
import { FlowNode, FlowEdge } from '../../types';

export function layoutSubflowNodes(children: FlowNode[], edges: FlowEdge[]): { width: number; height: number } {
    if (children.length === 0) {
        return { width: 200, height: 100 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'LR',
        nodesep: 30,
        ranksep: 40,
        marginx: 20,
        marginy: 20
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const child of children) {
        const labelWidth = Math.max(80, child.label.length * 7 + 30);
        child.width = labelWidth;
        child.height = 36;
        g.setNode(child.id, { width: child.width, height: child.height });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
        const layoutNode = g.node(child.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            child.x = layoutNode.x - child.width / 2;
            child.y = layoutNode.y - child.height / 2;
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
        }
    }

    return { width: maxX + 20, height: maxY + 20 };
}

export function layoutSubflowNodesVertical(children: FlowNode[], edges: FlowEdge[]): { width: number; height: number } {
    if (children.length === 0) {
        return { width: 120, height: 100 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'TB',
        nodesep: 20,
        ranksep: 35,
        marginx: 15,
        marginy: 15
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const child of children) {
        child.width = 180;
        child.height = 60;
        g.setNode(child.id, { width: child.width, height: child.height });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
        const layoutNode = g.node(child.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            child.x = layoutNode.x - child.width / 2;
            child.y = layoutNode.y - child.height / 2;
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
        }
    }

    return { width: maxX + 10, height: maxY + 10 };
}
