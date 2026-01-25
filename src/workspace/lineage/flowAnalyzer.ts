// Flow Analyzer - Analyze upstream/downstream data flow

import { LineageGraph, LineageNode, LineagePath, LineageEdge } from './types';

/**
 * Options for flow analysis
 */
export interface FlowOptions {
    maxDepth?: number;         // Limit traversal depth
    includeColumns?: boolean;  // Include column-level nodes
    filterTypes?: string[];    // Filter by node type
    excludeExternal?: boolean; // Exclude external tables
}

/**
 * Result of flow analysis
 */
export interface FlowResult {
    nodes: LineageNode[];
    edges: any[];
    paths: LineagePath[];
    depth: number;
}

/**
 * Analyzes directional data flow through the lineage graph
 */
export class FlowAnalyzer {
    constructor(private graph: LineageGraph) {}

    /**
     * Get all nodes upstream of a target (data sources)
     */
    getUpstream(nodeId: string, options: FlowOptions = {}): FlowResult {
        const {
            maxDepth = -1,
            filterTypes,
            excludeExternal = false
        } = options;

        const visited = new Set<string>();
        const resultNodes: LineageNode[] = [];
        const resultEdges: any[] = [];

        const traverse = (currentId: string, currentDepth: number): void => {
            if (maxDepth !== -1 && currentDepth >= maxDepth) {return;}
            if (visited.has(currentId)) {return;}

            visited.add(currentId);

            // Find incoming edges
            const incomingEdges = this.graph.edges.filter(e => e.targetId === currentId);

            for (const edge of incomingEdges) {
                const sourceNode = this.graph.nodes.get(edge.sourceId);

                if (!sourceNode) {continue;}
                if (excludeExternal && sourceNode.type === 'external') {continue;}
                if (filterTypes && !filterTypes.includes(sourceNode.type)) {continue;}

                if (!visited.has(sourceNode.id)) {
                    resultNodes.push(sourceNode);
                    resultEdges.push(edge);
                    traverse(sourceNode.id, currentDepth + 1);
                }
            }
        };

        traverse(nodeId, 0);

        return {
            nodes: resultNodes,
            edges: resultEdges,
            paths: this.buildPathsFromEdges(resultEdges),
            depth: this.calculateDepth(resultEdges, nodeId)
        };
    }

    /**
     * Get all nodes downstream of a source (data consumers)
     */
    getDownstream(nodeId: string, options: FlowOptions = {}): FlowResult {
        const {
            maxDepth = -1,
            filterTypes,
            excludeExternal = false
        } = options;

        const visited = new Set<string>();
        const resultNodes: LineageNode[] = [];
        const resultEdges: any[] = [];

        const traverse = (currentId: string, currentDepth: number): void => {
            if (maxDepth !== -1 && currentDepth >= maxDepth) {return;}
            if (visited.has(currentId)) {return;}

            visited.add(currentId);

            // Find outgoing edges
            const outgoingEdges = this.graph.edges.filter(e => e.sourceId === currentId);

            for (const edge of outgoingEdges) {
                const targetNode = this.graph.nodes.get(edge.targetId);

                if (!targetNode) {continue;}
                if (excludeExternal && targetNode.type === 'external') {continue;}
                if (filterTypes && !filterTypes.includes(targetNode.type)) {continue;}

                if (!visited.has(targetNode.id)) {
                    resultNodes.push(targetNode);
                    resultEdges.push(edge);
                    traverse(targetNode.id, currentDepth + 1);
                }
            }
        };

        traverse(nodeId, 0);

        return {
            nodes: resultNodes,
            edges: resultEdges,
            paths: this.buildPathsFromEdges(resultEdges),
            depth: this.calculateDepth(resultEdges, nodeId)
        };
    }

    /**
     * Get the complete data flow path between two nodes
     */
    getPathBetween(sourceId: string, targetId: string): LineagePath[] {
        const paths: LineagePath[] = [];
        const visited = new Set<string>();

        const dfs = (currentId: string, currentPath: LineageNode[], currentEdges: LineageEdge[]): void => {
            if (currentId === targetId) {
                paths.push({
                    nodes: [...currentPath],
                    edges: [...currentEdges],
                    depth: currentPath.length
                });
                return;
            }

            visited.add(currentId);

            const outgoingEdges = this.graph.edges.filter(e => e.sourceId === currentId);

            for (const edge of outgoingEdges) {
                if (visited.has(edge.targetId)) {continue;}

                const targetNode = this.graph.nodes.get(edge.targetId);
                if (!targetNode) {continue;}

                dfs(
                    edge.targetId,
                    [...currentPath, targetNode],
                    [...currentEdges, edge]
                );
            }

            visited.delete(currentId);
        };

        const sourceNode = this.graph.nodes.get(sourceId);
        if (sourceNode) {
            dfs(sourceId, [sourceNode], []);
        }

        return paths;
    }

    /**
     * Find root sources (tables with no upstream dependencies)
     */
    findRootSources(): LineageNode[] {
        const roots: LineageNode[] = [];

        for (const [id, node] of this.graph.nodes) {
            if (node.type === 'external') {continue;}

            const hasIncoming = this.graph.edges.some(e => e.targetId === id);
            if (!hasIncoming) {
                roots.push(node);
            }
        }

        return roots;
    }

    /**
     * Find terminal nodes (tables with no downstream consumers)
     */
    findTerminalNodes(): LineageNode[] {
        const terminals: LineageNode[] = [];

        for (const [id, node] of this.graph.nodes) {
            if (node.type === 'external') {continue;}

            const hasOutgoing = this.graph.edges.some(e => e.sourceId === id);
            if (!hasOutgoing) {
                terminals.push(node);
            }
        }

        return terminals;
    }

    /**
     * Detect circular dependencies
     */
    detectCycles(): LineagePath[] {
        const cycles: LineagePath[] = [];
        const visited = new Set<string>();
        const recStack = new Set<string>();

        const dfs = (nodeId: string, path: LineageNode[], edges: LineageEdge[]): void => {
            visited.add(nodeId);
            recStack.add(nodeId);

            const outgoingEdges = this.graph.edges.filter(e => e.sourceId === nodeId);

            for (const edge of outgoingEdges) {
                const targetNode = this.graph.nodes.get(edge.targetId);
                if (!targetNode) {continue;}

                if (recStack.has(edge.targetId)) {
                    // Found a cycle
                    const cycleStart = path.findIndex(n => n.id === edge.targetId);
                    const cycleNodes = path.slice(cycleStart);
                    cycles.push({
                        nodes: [...cycleNodes, targetNode],
                        edges: [...edges, edge],
                        depth: cycleNodes.length + 1
                    });
                } else if (!visited.has(edge.targetId)) {
                    dfs(
                        edge.targetId,
                        [...path, targetNode],
                        [...edges, edge]
                    );
                }
            }

            recStack.delete(nodeId);
        };

        for (const [id] of this.graph.nodes) {
            if (!visited.has(id)) {
                const node = this.graph.nodes.get(id);
                if (node) {
                    dfs(id, [node], []);
                }
            }
        }

        return cycles;
    }

    /**
     * Build paths from edges for flow result
     */
    private buildPathsFromEdges(edges: LineageEdge[]): LineagePath[] {
        const paths: LineagePath[] = [];
        const processed = new Set<string>();

        for (const edge of edges) {
            const pathKey = `${edge.sourceId}->${edge.targetId}`;
            if (processed.has(pathKey)) {continue;}

            const sourceNode = this.graph.nodes.get(edge.sourceId);
            const targetNode = this.graph.nodes.get(edge.targetId);

            if (sourceNode && targetNode) {
                paths.push({
                    nodes: [sourceNode, targetNode],
                    edges: [edge],
                    depth: 1
                });
                processed.add(pathKey);
            }
        }

        return paths;
    }

    /**
     * Calculate maximum depth of edges
     */
    private calculateDepth(edges: LineageEdge[], startNodeId: string): number {
        const depths = new Map<string, number>();
        depths.set(startNodeId, 0);

        let changed = true;
        while (changed) {
            changed = false;

            for (const edge of edges) {
                const sourceDepth = depths.get(edge.sourceId) ?? 0;
                const currentDepth = depths.get(edge.targetId) ?? 0;

                if (sourceDepth + 1 > currentDepth) {
                    depths.set(edge.targetId, sourceDepth + 1);
                    changed = true;
                }
            }
        }

        return Math.max(0, ...Array.from(depths.values()));
    }
}
