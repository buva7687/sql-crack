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
    private readonly incomingEdgesByNodeId: Map<string, LineageEdge[]>;
    private readonly outgoingEdgesByNodeId: Map<string, LineageEdge[]>;

    constructor(private graph: LineageGraph) {
        this.incomingEdgesByNodeId = this.buildEdgeIndex('targetId');
        this.outgoingEdgesByNodeId = this.buildEdgeIndex('sourceId');
    }

    private buildEdgeIndex(direction: 'sourceId' | 'targetId'): Map<string, LineageEdge[]> {
        const index = new Map<string, LineageEdge[]>();

        for (const edge of this.graph.edges) {
            const key = edge[direction];
            const bucket = index.get(key);
            if (bucket) {
                bucket.push(edge);
            } else {
                index.set(key, [edge]);
            }
        }

        return index;
    }

    private getIncomingEdges(nodeId: string): LineageEdge[] {
        return this.incomingEdgesByNodeId.get(nodeId) || [];
    }

    private getOutgoingEdges(nodeId: string): LineageEdge[] {
        return this.outgoingEdgesByNodeId.get(nodeId) || [];
    }

    private collectDirectionalFlow(
        nodeId: string,
        direction: 'upstream' | 'downstream',
        options: FlowOptions
    ): FlowResult {
        const {
            maxDepth = -1,
            filterTypes,
            excludeExternal = false
        } = options;

        type TraversalFrame = {
            currentId: string;
            currentDepth: number;
            edges: LineageEdge[];
            nextEdgeIndex: number;
            entered: boolean;
        };

        const visited = new Set<string>();
        const resultNodes: LineageNode[] = [];
        const resultEdges: LineageEdge[] = [];
        let reachedDepth = 0;
        const frames: TraversalFrame[] = [{
            currentId: nodeId,
            currentDepth: 0,
            edges: [],
            nextEdgeIndex: 0,
            entered: false
        }];

        while (frames.length > 0) {
            const frame = frames[frames.length - 1];

            if (!frame.entered) {
                if (maxDepth !== -1 && frame.currentDepth >= maxDepth) {
                    frames.pop();
                    continue;
                }
                if (visited.has(frame.currentId)) {
                    frames.pop();
                    continue;
                }

                visited.add(frame.currentId);
                frame.edges = direction === 'upstream'
                    ? this.getIncomingEdges(frame.currentId)
                    : this.getOutgoingEdges(frame.currentId);
                frame.entered = true;
            }

            if (frame.nextEdgeIndex >= frame.edges.length) {
                frames.pop();
                continue;
            }

            const edge = frame.edges[frame.nextEdgeIndex];
            frame.nextEdgeIndex++;

            const nextId = direction === 'upstream' ? edge.sourceId : edge.targetId;
            const nextNode = this.graph.nodes.get(nextId);

            if (!nextNode) {continue;}
            if (excludeExternal && nextNode.type === 'external') {continue;}
            if (filterTypes && !filterTypes.includes(nextNode.type)) {continue;}

            if (!visited.has(nextNode.id)) {
                const nextDepth = frame.currentDepth + 1;
                resultNodes.push(nextNode);
                resultEdges.push(edge);
                reachedDepth = Math.max(reachedDepth, nextDepth);
                frames.push({
                    currentId: nextNode.id,
                    currentDepth: nextDepth,
                    edges: [],
                    nextEdgeIndex: 0,
                    entered: false
                });
            }
        }

        return {
            nodes: resultNodes,
            edges: resultEdges,
            paths: this.buildPathsFromEdges(resultEdges),
            depth: reachedDepth
        };
    }

    /**
     * Get all nodes upstream of a target (data sources)
     */
    getUpstream(nodeId: string, options: FlowOptions = {}): FlowResult {
        return this.collectDirectionalFlow(nodeId, 'upstream', options);
    }

    /**
     * Get all nodes downstream of a source (data consumers)
     */
    getDownstream(nodeId: string, options: FlowOptions = {}): FlowResult {
        return this.collectDirectionalFlow(nodeId, 'downstream', options);
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

            for (const edge of this.getOutgoingEdges(currentId)) {
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

            if (this.getIncomingEdges(id).length === 0) {
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

            if (this.getOutgoingEdges(id).length === 0) {
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

            for (const edge of this.getOutgoingEdges(nodeId)) {
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

}
