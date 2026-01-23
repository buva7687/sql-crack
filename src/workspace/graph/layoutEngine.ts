// Layout Engine - Apply layout algorithms to graphs

import { GraphNode, GraphEdge, LayoutType } from './types';

/**
 * Applies various layout algorithms to position nodes
 */
export class LayoutEngine {
    /**
     * Apply hierarchical layout (existing dagre-based logic)
     */
    hierarchicalLayout(nodes: GraphNode[], edges: GraphEdge[]): void {
        // The existing code uses dagre for layout
        // This is a placeholder that would integrate with existing logic
        // In practice, the existing dependencyGraph.ts already handles this
    }

    /**
     * Apply force-directed layout for complex graphs
     * Simplified implementation - in production would use d3-force or similar
     */
    forceDirectedLayout(
        nodes: GraphNode[],
        edges: GraphEdge[],
        options: {
            width?: number;
            height?: number;
            iterations?: number;
        } = {}
    ): void {
        const { width = 1200, height = 800, iterations = 100 } = options;

        // Initialize positions in a circle if not set
        const hasPositions = nodes.every(n => n.x !== undefined && n.y !== undefined);

        if (!hasPositions) {
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 3;

            nodes.forEach((node, i) => {
                const angle = (2 * Math.PI * i) / nodes.length;
                node.x = centerX + radius * Math.cos(angle);
                node.y = centerY + radius * Math.sin(angle);
            });
        }

        // Simple force-directed simulation
        // In production, use d3-force or similar library
        for (let iter = 0; iter < iterations; iter++) {
            // Repulsion between all nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = 5000 / (dist * dist);

                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    nodes[i].x -= fx;
                    nodes[i].y -= fy;
                    nodes[j].x += fx;
                    nodes[j].y += fy;
                }
            }

            // Attraction along edges
            for (const edge of edges) {
                const source = nodes.find(n => n.id === edge.source);
                const target = nodes.find(n => n.id === edge.target);

                if (source && target) {
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = (dist - 100) * 0.05;

                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    source.x += fx;
                    source.y += fy;
                    target.x -= fx;
                    target.y -= fy;
                }
            }

            // Center gravity
            const centerX = width / 2;
            const centerY = height / 2;

            for (const node of nodes) {
                node.x += (centerX - node.x) * 0.01;
                node.y += (centerY - node.y) * 0.01;
            }
        }

        // Update dimensions
        this.updateNodeDimensions(nodes);
    }

    /**
     * Apply radial layout centered on a focus node
     */
    radialLayout(
        nodes: GraphNode[],
        edges: GraphEdge[],
        focusId: string,
        options: {
            width?: number;
            height?: number;
            levelSpacing?: number;
        } = {}
    ): void {
        const { width = 1200, height = 800, levelSpacing = 150 } = options;
        const focusNode = nodes.find(n => n.id === focusId);

        if (!focusNode) return;

        // Position focus node in center
        focusNode.x = width / 2;
        focusNode.y = height / 2;

        // Calculate levels using BFS
        const levels = new Map<string, number>();
        const visited = new Set<string>([focusId]);
        const queue: [string, number][] = [[focusId, 0]];

        levels.set(focusId, 0);

        while (queue.length > 0) {
            const [nodeId, level] = queue.shift()!;

            const neighbors = edges
                .filter(e => e.source === nodeId)
                .map(e => e.target)
                .filter(id => !visited.has(id));

            for (const neighborId of neighbors) {
                visited.add(neighborId);
                levels.set(neighborId, level + 1);
                queue.push([neighborId, level + 1]);
            }
        }

        // Group nodes by level
        const nodesByLevel = new Map<number, GraphNode[]>();
        for (const [nodeId, level] of levels) {
            if (!nodesByLevel.has(level)) {
                nodesByLevel.set(level, []);
            }
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                nodesByLevel.get(level)!.push(node);
            }
        }

        // Position nodes in concentric circles
        const maxLevel = Math.max(...Array.from(levels.values()));

        for (let level = 0; level <= maxLevel; level++) {
            const levelNodes = nodesByLevel.get(level) || [];
            const radius = level * levelSpacing;
            const centerX = width / 2;
            const centerY = height / 2;

            levelNodes.forEach((node, i) => {
                if (level === 0) return; // Skip focus node

                const angle = (2 * Math.PI * i) / levelNodes.length;
                node.x = centerX + radius * Math.cos(angle);
                node.y = centerY + radius * Math.sin(angle);
            });
        }

        this.updateNodeDimensions(nodes);
    }

    /**
     * Auto-select best layout based on graph characteristics
     */
    autoLayout(
        nodes: GraphNode[],
        edges: GraphEdge[],
        options: { width?: number; height?: number } = {}
    ): LayoutType {
        const { width = 1200, height = 800 } = options;

        const nodeCount = nodes.length;
        const edgeCount = edges.length;
        const density = edgeCount / (nodeCount * nodeCount);

        // Choose layout based on graph characteristics
        if (nodeCount < 20 && edgeCount < nodeCount * 1.5) {
            // Small, sparse graph - use hierarchical
            return 'hierarchical';
        } else if (density > 0.3) {
            // Dense graph - use force-directed
            this.forceDirectedLayout(nodes, edges, { width, height });
            return 'force-directed';
        } else {
            // Medium density - use force-directed as default
            this.forceDirectedLayout(nodes, edges, { width, height, iterations: 50 });
            return 'force-directed';
        }
    }

    /**
     * Update node dimensions based on content
     */
    private updateNodeDimensions(nodes: GraphNode[]): void {
        const NODE_WIDTH = 180;
        const NODE_HEIGHT = 60;

        for (const node of nodes) {
            node.width = node.width || NODE_WIDTH;
            node.height = node.height || NODE_HEIGHT;
        }
    }

    /**
     * Calculate bounding box of graph
     */
    calculateBounds(nodes: GraphNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const node of nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        }

        return { minX, minY, maxX, maxY };
    }
}
