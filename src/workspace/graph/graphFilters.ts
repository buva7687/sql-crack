// Graph Filters - Filter and search graphs

import { Graph, GraphNode, GraphEdge, FilterOptions, SearchOptions } from './types';

/**
 * Filtering and searching operations on graphs
 */
export class GraphFilters {
    /**
     * Filter to show only upstream of a node
     */
    filterUpstream(graph: Graph, nodeId: string, depth?: number): Graph {
        const includedIds = new Set<string>([nodeId]);
        const queue: [string, number][] = [[nodeId, 0]];
        const maxDepth = depth ?? -1;

        // BFS upstream (follow incoming edges)
        while (queue.length > 0) {
            const [currentId, currentDepth] = queue.shift()!;

            if (maxDepth !== -1 && currentDepth >= maxDepth) {continue;}

            const incoming = graph.edges
                .filter(e => e.target === currentId)
                .map(e => e.source);

            for (const sourceId of incoming) {
                if (!includedIds.has(sourceId)) {
                    includedIds.add(sourceId);
                    queue.push([sourceId, currentDepth + 1]);
                }
            }
        }

        return this.filterByIds(graph, includedIds);
    }

    /**
     * Filter to show only downstream of a node
     */
    filterDownstream(graph: Graph, nodeId: string, depth?: number): Graph {
        const includedIds = new Set<string>([nodeId]);
        const queue: [string, number][] = [[nodeId, 0]];
        const maxDepth = depth ?? -1;

        // BFS downstream (follow outgoing edges)
        while (queue.length > 0) {
            const [currentId, currentDepth] = queue.shift()!;

            if (maxDepth !== -1 && currentDepth >= maxDepth) {continue;}

            const outgoing = graph.edges
                .filter(e => e.source === currentId)
                .map(e => e.target);

            for (const targetId of outgoing) {
                if (!includedIds.has(targetId)) {
                    includedIds.add(targetId);
                    queue.push([targetId, currentDepth + 1]);
                }
            }
        }

        return this.filterByIds(graph, includedIds);
    }

    /**
     * Filter by node type
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
     * Filter by search query
     */
    filterBySearch(graph: Graph, query: string, options: Partial<SearchOptions> = {}): Graph {
        const opts = {
            caseSensitive: false,
            searchInLabels: true,
            searchInMetadata: false,
            ...options
        };

        const {
            caseSensitive,
            searchInLabels,
            searchInMetadata
        } = opts;

        const searchQuery = caseSensitive ? query : query.toLowerCase();

        const filteredNodes = graph.nodes.filter(node => {
            let matches = false;

            // Search in label
            if (searchInLabels) {
                const label = caseSensitive ? node.label : node.label.toLowerCase();
                matches = label.includes(searchQuery);
            }

            // Search in metadata
            if (!matches && searchInMetadata) {
                const metadataStr = JSON.stringify(node.metadata);
                const metadata = caseSensitive ? metadataStr : metadataStr.toLowerCase();
                matches = metadata.includes(searchQuery);
            }

            return matches;
        });

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
     * Highlight path between two nodes
     */
    highlightPath(graph: Graph, sourceId: string, targetId: string): Graph {
        const nodes = graph.nodes.map(n => ({ ...n, highlighted: false, dimmed: true }));
        const edges = graph.edges.map(e => ({ ...e, metadata: { ...e.metadata, highlighted: false } }));

        // Find shortest path using BFS
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

            // Update highlighting
            for (let i = 0; i < nodes.length; i++) {
                nodes[i].highlighted = pathIds.has(nodes[i].id);
                nodes[i].dimmed = !pathIds.has(nodes[i].id);
            }

            for (let i = 0; i < edges.length; i++) {
                edges[i].metadata.highlighted =
                    pathIds.has(edges[i].source) && pathIds.has(edges[i].target);
            }
        }

        return {
            nodes,
            edges,
            options: graph.options
        };
    }

    /**
     * Apply multiple filters
     */
    applyFilters(graph: Graph, filters: FilterOptions): Graph {
        let result = graph;

        if (filters.nodeTypes) {
            result = this.filterByType(result, filters.nodeTypes);
        }

        if (filters.excludeExternal) {
            result = this.filterByType(result, ['file', 'table', 'view', 'column']);
        }

        return result;
    }

    /**
     * Filter graph by included node IDs
     */
    private filterByIds(graph: Graph, includedIds: Set<string>): Graph {
        const filteredNodes = graph.nodes.filter(n => includedIds.has(n.id));
        const filteredEdges = graph.edges.filter(e =>
            includedIds.has(e.source) && includedIds.has(e.target)
        );

        return {
            nodes: filteredNodes,
            edges: filteredEdges,
            options: graph.options
        };
    }

    /**
     * Get connected components
     */
    getConnectedComponents(graph: Graph): Graph[] {
        const visited = new Set<string>();
        const components: Graph[] = [];

        for (const node of graph.nodes) {
            if (visited.has(node.id)) {continue;}

            const componentIds = new Set<string>();
            const queue: string[] = [node.id];

            while (queue.length > 0) {
                const current = queue.shift()!;
                if (componentIds.has(current)) {continue;}

                componentIds.add(current);
                visited.add(current);

                // Find neighbors
                const incoming = graph.edges
                    .filter(e => e.target === current)
                    .map(e => e.source);

                const outgoing = graph.edges
                    .filter(e => e.source === current)
                    .map(e => e.target);

                for (const neighbor of [...incoming, ...outgoing]) {
                    if (!componentIds.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }

            // Create component graph
            const componentNodes = graph.nodes.filter(n => componentIds.has(n.id));
            const componentEdges = graph.edges.filter(e =>
                componentIds.has(e.source) && componentIds.has(e.target)
            );

            components.push({
                nodes: componentNodes,
                edges: componentEdges,
                options: graph.options
            });
        }

        return components;
    }
}
