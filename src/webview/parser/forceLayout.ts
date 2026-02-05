// Alternative layout algorithms
// Provides multiple layout options beyond the default vertical dagre layout

import dagre from 'dagre';
import * as d3Force from 'd3-force';
import { FlowNode, FlowEdge } from '../types';

/**
 * Horizontal layout using dagre with left-to-right direction
 * This is deterministic and provides a clean alternative to the default top-to-bottom layout
 */
export function layoutGraphHorizontal(
    nodes: FlowNode[],
    edges: FlowEdge[],
    bottomUp: boolean = false
): void {
    if (nodes.length === 0) { return; }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: bottomUp ? 'RL' : 'LR',  // Right to Left when bottom-up, otherwise Left to Right
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
 * Compact layout using dagre with tighter spacing
 * Good for simple queries where space efficiency is preferred
 */
export function layoutGraphCompact(
    nodes: FlowNode[],
    edges: FlowEdge[],
    bottomUp: boolean = false
): void {
    if (nodes.length === 0) { return; }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: bottomUp ? 'BT' : 'TB',  // Bottom to Top when bottom-up
        nodesep: 30,    // Tighter horizontal spacing
        ranksep: 50,    // Tighter vertical spacing
        marginx: 15,
        marginy: 15
    });
    g.setDefaultEdgeLabel(() => ({}));

    nodes.forEach(node => {
        g.setNode(node.id, { width: node.width, height: node.height });
    });

    edges.forEach(edge => {
        g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    nodes.forEach(node => {
        const nodeWithPos = g.node(node.id);
        if (nodeWithPos && nodeWithPos.x !== undefined && nodeWithPos.y !== undefined) {
            node.x = nodeWithPos.x - node.width / 2;
            node.y = nodeWithPos.y - node.height / 2;
        }
    });
}

/**
 * Force-directed layout using d3-force
 * Creates organic, physics-based arrangement that can reveal clusters
 */
export function layoutGraphForce(
    nodes: FlowNode[],
    edges: FlowEdge[]
): void {
    if (nodes.length === 0) { return; }

    // Create simulation nodes with initial positions
    const simNodes: d3Force.SimulationNodeDatum[] = nodes.map((node, i) => ({
        index: i,
        x: node.x || Math.random() * 500,
        y: node.y || Math.random() * 500,
    }));

    // Create node lookup for edges
    const nodeIndexMap = new Map<string, number>();
    nodes.forEach((node, i) => nodeIndexMap.set(node.id, i));

    // Create simulation links
    const simLinks: d3Force.SimulationLinkDatum<d3Force.SimulationNodeDatum>[] = edges
        .filter(edge => nodeIndexMap.has(edge.source) && nodeIndexMap.has(edge.target))
        .map(edge => ({
            source: nodeIndexMap.get(edge.source)!,
            target: nodeIndexMap.get(edge.target)!,
        }));

    // Calculate average node size for spacing
    const avgWidth = nodes.reduce((sum, n) => sum + n.width, 0) / nodes.length;
    const avgHeight = nodes.reduce((sum, n) => sum + n.height, 0) / nodes.length;
    const avgSize = (avgWidth + avgHeight) / 2;

    // Create and run simulation
    const simulation = d3Force.forceSimulation(simNodes)
        .force('link', d3Force.forceLink(simLinks).distance(avgSize * 2).strength(0.5))
        .force('charge', d3Force.forceManyBody().strength(-avgSize * 3))
        .force('center', d3Force.forceCenter(300, 300))
        .force('collision', d3Force.forceCollide().radius(avgSize * 0.8))
        .stop();

    // Run simulation synchronously
    for (let i = 0; i < 300; i++) {
        simulation.tick();
    }

    // Apply positions to nodes
    nodes.forEach((node, i) => {
        const simNode = simNodes[i];
        if (simNode.x !== undefined && simNode.y !== undefined) {
            node.x = simNode.x - node.width / 2;
            node.y = simNode.y - node.height / 2;
        }
    });

    // Normalize positions to start from (0, 0)
    normalizePositions(nodes);
}

/**
 * Radial layout - arranges nodes in concentric circles based on graph depth
 * Central node (root) at center, with layers radiating outward
 */
export function layoutGraphRadial(
    nodes: FlowNode[],
    edges: FlowEdge[]
): void {
    if (nodes.length === 0) { return; }
    if (nodes.length === 1) {
        nodes[0].x = 100;
        nodes[0].y = 100;
        return;
    }

    // Build adjacency for BFS
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    nodes.forEach(n => {
        outgoing.set(n.id, []);
        incoming.set(n.id, []);
    });
    edges.forEach(e => {
        outgoing.get(e.source)?.push(e.target);
        incoming.get(e.target)?.push(e.source);
    });

    // Find root nodes (no incoming edges or most connections)
    let roots = nodes.filter(n => (incoming.get(n.id)?.length || 0) === 0);
    if (roots.length === 0) {
        // Fallback: use node with most outgoing connections
        roots = [nodes.reduce((best, n) =>
            (outgoing.get(n.id)?.length || 0) > (outgoing.get(best.id)?.length || 0) ? n : best
        )];
    }

    // BFS to determine layers
    const layers = new Map<string, number>();
    const queue: { id: string; layer: number }[] = roots.map(r => ({ id: r.id, layer: 0 }));
    const visited = new Set<string>();

    while (queue.length > 0) {
        const { id, layer } = queue.shift()!;
        if (visited.has(id)) {continue;}
        visited.add(id);
        layers.set(id, layer);

        for (const targetId of outgoing.get(id) || []) {
            if (!visited.has(targetId)) {
                queue.push({ id: targetId, layer: layer + 1 });
            }
        }
    }

    // Handle disconnected nodes
    nodes.forEach(n => {
        if (!layers.has(n.id)) {
            layers.set(n.id, 0);
        }
    });

    // Group nodes by layer
    const layerGroups = new Map<number, FlowNode[]>();
    nodes.forEach(n => {
        const layer = layers.get(n.id) || 0;
        if (!layerGroups.has(layer)) {
            layerGroups.set(layer, []);
        }
        layerGroups.get(layer)!.push(n);
    });

    // Calculate radial positions
    const avgSize = nodes.reduce((sum, n) => sum + Math.max(n.width, n.height), 0) / nodes.length;
    const baseRadius = avgSize * 1.5;
    const layerSpacing = avgSize * 2;
    const centerX = 400;
    const centerY = 400;

    layerGroups.forEach((layerNodes, layer) => {
        if (layer === 0 && layerNodes.length === 1) {
            // Single root at center
            layerNodes[0].x = centerX - layerNodes[0].width / 2;
            layerNodes[0].y = centerY - layerNodes[0].height / 2;
        } else {
            const radius = baseRadius + layer * layerSpacing;
            const angleStep = (2 * Math.PI) / layerNodes.length;
            const startAngle = -Math.PI / 2; // Start from top

            layerNodes.forEach((node, i) => {
                const angle = startAngle + i * angleStep;
                node.x = centerX + radius * Math.cos(angle) - node.width / 2;
                node.y = centerY + radius * Math.sin(angle) - node.height / 2;
            });
        }
    });

    // Normalize positions
    normalizePositions(nodes);
}

/**
 * Normalize node positions to start from a reasonable origin
 */
function normalizePositions(nodes: FlowNode[]): void {
    if (nodes.length === 0) {return;}

    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const padding = 40;

    nodes.forEach(node => {
        node.x = node.x - minX + padding;
        node.y = node.y - minY + padding;
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
