// Graph Builder - Build visualization graphs from workspace data

import { WorkspaceDependencyGraph, WorkspaceNode, WorkspaceEdge } from '../types';
import { GraphNode, GraphEdge, GraphOptions, Graph } from './types';

/**
 * Builds visualization graphs from workspace data
 */
export class GraphBuilder {
    /**
     * Build visualization graph from workspace dependency graph
     */
    buildFromWorkspace(workspaceGraph: WorkspaceDependencyGraph, options: Partial<GraphOptions> = {}): Graph {
        const graphOptions: GraphOptions = {
            mode: 'file',
            direction: 'TB',
            showColumns: false,
            showExternal: true,
            maxDepth: -1,
            ...options
        };

        const nodes: GraphNode[] = workspaceGraph.nodes.map(node => this.convertNode(node));
        const edges: GraphEdge[] = workspaceGraph.edges.map(edge => this.convertEdge(edge));

        return {
            nodes,
            edges,
            options: graphOptions
        };
    }

    /**
     * Convert workspace node to graph node
     */
    private convertNode(workspaceNode: WorkspaceNode): GraphNode {
        return {
            id: workspaceNode.id,
            type: workspaceNode.type,
            label: workspaceNode.label,
            sublabel: workspaceNode.definitionCount || workspaceNode.referenceCount
                ? `${workspaceNode.definitionCount || 0} defs, ${workspaceNode.referenceCount || 0} refs`
                : undefined,
            x: workspaceNode.x,
            y: workspaceNode.y,
            width: workspaceNode.width,
            height: workspaceNode.height,
            filePath: workspaceNode.filePath,
            lineNumber: undefined,
            columns: undefined,
            metadata: {
                definitions: workspaceNode.definitions,
                references: workspaceNode.references,
                definitionCount: workspaceNode.definitionCount,
                referenceCount: workspaceNode.referenceCount
            },
            highlighted: false,
            dimmed: false,
            expanded: false
        };
    }

    /**
     * Convert workspace edge to graph edge
     */
    private convertEdge(workspaceEdge: WorkspaceEdge): GraphEdge {
        return {
            id: workspaceEdge.id,
            source: workspaceEdge.source,
            target: workspaceEdge.target,
            type: 'dependency',
            label: workspaceEdge.count > 1 ? String(workspaceEdge.count) : undefined,
            metadata: {
                referenceType: workspaceEdge.referenceType,
                count: workspaceEdge.count,
                tables: workspaceEdge.tables
            }
        };
    }

    /**
     * Create graph for specific mode
     */
    buildForMode(
        workspaceGraph: WorkspaceDependencyGraph,
        mode: GraphOptions['mode']
    ): Graph {
        return this.buildFromWorkspace(workspaceGraph, { mode });
    }

    /**
     * Filter graph by node type
     */
    filterByType(graph: Graph, types: GraphNode['type'][]): Graph {
        const filteredNodes = graph.nodes.filter(n => types.includes(n.type));
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredEdges = graph.edges.filter(e =>
            nodeIds.has(e.source) && nodeIds.has(e.target)
        );

        return {
            nodes: filteredNodes,
            edges: filteredEdges,
            options: graph.options
        };
    }

    /**
     * Focus graph on a specific node
     */
    focusOnNode(graph: Graph, nodeId: string, depth: number = 2): Graph {
        const focusNode = graph.nodes.find(n => n.id === nodeId);
        if (!focusNode) {return graph;}

        const includedIds = new Set<string>([nodeId]);
        const queue: [string, number][] = [[nodeId, 0]];

        // BFS to find all nodes within depth
        while (queue.length > 0) {
            const [currentId, currentDepth] = queue.shift()!;

            if (currentDepth >= depth) {continue;}

            // Find neighbors
            const incoming = graph.edges
                .filter(e => e.target === currentId)
                .map(e => e.source);

            const outgoing = graph.edges
                .filter(e => e.source === currentId)
                .map(e => e.target);

            for (const neighborId of [...incoming, ...outgoing]) {
                if (!includedIds.has(neighborId)) {
                    includedIds.add(neighborId);
                    queue.push([neighborId, currentDepth + 1]);
                }
            }
        }

        const filteredNodes = graph.nodes.filter(n => includedIds.has(n.id));
        const filteredEdges = graph.edges.filter(e =>
            includedIds.has(e.source) && includedIds.has(e.target)
        );

        return {
            nodes: filteredNodes,
            edges: filteredEdges,
            options: { ...graph.options, focusNode: nodeId }
        };
    }

    /**
     * Highlight path between two nodes
     */
    highlightPath(graph: Graph, sourceId: string, targetId: string): Graph {
        const nodes = [...graph.nodes];
        const edges = [...graph.edges];

        // Find path using BFS
        const visited = new Set<string>();
        const parentMap = new Map<string, string>();
        const queue: string[] = [sourceId];
        let found = false;

        visited.add(sourceId);

        while (queue.length > 0 && !found) {
            const current = queue.shift()!;

            if (current === targetId) {
                found = true;
                break;
            }

            const neighbors = edges
                .filter(e => e.source === current)
                .map(e => e.target);

            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    parentMap.set(neighbor, current);
                    queue.push(neighbor);
                }
            }
        }

        if (found) {
            // Trace back path
            const pathIds = new Set<string>([targetId]);
            let current = targetId;

            while (current !== sourceId) {
                const parent = parentMap.get(current);
                if (parent) {
                    pathIds.add(parent);
                    current = parent;
                } else {
                    break;
                }
            }

            // Update nodes and edges
            for (let i = 0; i < nodes.length; i++) {
                nodes[i].highlighted = pathIds.has(nodes[i].id);
                nodes[i].dimmed = !pathIds.has(nodes[i].id);
            }

            for (let i = 0; i < edges.length; i++) {
                edges[i].metadata.highlighted =
                    pathIds.has(edges[i].source) && pathIds.has(edges[i].target);
            }
        }

        return { nodes, edges, options: graph.options };
    }
}
