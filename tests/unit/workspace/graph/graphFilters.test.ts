/**
 * Graph Filters Tests
 *
 * Tests for graph filtering and searching algorithms.
 * These are pure functions operating on graph data structures.
 */

import { GraphFilters } from '../../../../src/workspace/graph/graphFilters';
import { Graph, GraphNode, GraphEdge, GraphOptions } from '../../../../src/workspace/graph/types';

describe('GraphFilters', () => {
    let filters: GraphFilters;

    // Helper to create a test graph
    const createTestGraph = (
        nodes: Partial<GraphNode>[],
        edges: Partial<GraphEdge>[]
    ): Graph => {
        const defaultOptions: GraphOptions = {
            mode: 'table',
            direction: 'TB',
            showColumns: false,
            showExternal: true,
            maxDepth: 10
        };

        return {
            nodes: nodes.map((n, i) => ({
                id: n.id || `node-${i}`,
                type: n.type || 'table',
                label: n.label || `Node ${i}`,
                x: 0,
                y: 0,
                width: 100,
                height: 50,
                metadata: n.metadata || {},
                ...n
            })) as GraphNode[],
            edges: edges.map((e, i) => ({
                id: e.id || `edge-${i}`,
                source: e.source || '',
                target: e.target || '',
                type: e.type || 'dependency',
                metadata: e.metadata || {},
                ...e
            })) as GraphEdge[],
            options: defaultOptions
        };
    };

    beforeEach(() => {
        filters = new GraphFilters();
    });

    describe('filterUpstream', () => {
        it('returns only upstream nodes from target', () => {
            // Graph: A -> B -> C -> D
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' },
                    { id: 'C', label: 'Table C' },
                    { id: 'D', label: 'Table D' }
                ],
                [
                    { source: 'A', target: 'B' },
                    { source: 'B', target: 'C' },
                    { source: 'C', target: 'D' }
                ]
            );

            const result = filters.filterUpstream(graph, 'C');

            expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C']);
            expect(result.edges).toHaveLength(2);
        });

        it('respects depth limit', () => {
            // Graph: A -> B -> C -> D
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' },
                    { id: 'C', label: 'Table C' },
                    { id: 'D', label: 'Table D' }
                ],
                [
                    { source: 'A', target: 'B' },
                    { source: 'B', target: 'C' },
                    { source: 'C', target: 'D' }
                ]
            );

            const result = filters.filterUpstream(graph, 'D', 1);

            // Only D and C (1 level up)
            expect(result.nodes.map(n => n.id).sort()).toEqual(['C', 'D']);
        });

        it('handles multiple upstream branches', () => {
            // Graph: A -> C, B -> C
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' },
                    { id: 'C', label: 'Table C' }
                ],
                [
                    { source: 'A', target: 'C' },
                    { source: 'B', target: 'C' }
                ]
            );

            const result = filters.filterUpstream(graph, 'C');

            expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C']);
        });

        it('handles node with no upstream', () => {
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' }
                ],
                [{ source: 'A', target: 'B' }]
            );

            const result = filters.filterUpstream(graph, 'A');

            expect(result.nodes.map(n => n.id)).toEqual(['A']);
            expect(result.edges).toHaveLength(0);
        });

        it('handles cycles without infinite loop', () => {
            // Graph: A -> B -> C -> A (cycle)
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' },
                    { id: 'C', label: 'Table C' }
                ],
                [
                    { source: 'A', target: 'B' },
                    { source: 'B', target: 'C' },
                    { source: 'C', target: 'A' }
                ]
            );

            const result = filters.filterUpstream(graph, 'B');

            // Should include all nodes due to cycle
            expect(result.nodes).toHaveLength(3);
        });
    });

    describe('filterDownstream', () => {
        it('returns only downstream nodes from source', () => {
            // Graph: A -> B -> C -> D
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' },
                    { id: 'C', label: 'Table C' },
                    { id: 'D', label: 'Table D' }
                ],
                [
                    { source: 'A', target: 'B' },
                    { source: 'B', target: 'C' },
                    { source: 'C', target: 'D' }
                ]
            );

            const result = filters.filterDownstream(graph, 'B');

            expect(result.nodes.map(n => n.id).sort()).toEqual(['B', 'C', 'D']);
            expect(result.edges).toHaveLength(2);
        });

        it('respects depth limit', () => {
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' },
                    { id: 'C', label: 'Table C' },
                    { id: 'D', label: 'Table D' }
                ],
                [
                    { source: 'A', target: 'B' },
                    { source: 'B', target: 'C' },
                    { source: 'C', target: 'D' }
                ]
            );

            const result = filters.filterDownstream(graph, 'A', 2);

            // A, B (1 level), C (2 levels)
            expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C']);
        });

        it('handles multiple downstream branches', () => {
            // Graph: A -> B, A -> C
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' },
                    { id: 'C', label: 'Table C' }
                ],
                [
                    { source: 'A', target: 'B' },
                    { source: 'A', target: 'C' }
                ]
            );

            const result = filters.filterDownstream(graph, 'A');

            expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C']);
        });

        it('handles node with no downstream', () => {
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'Table A' },
                    { id: 'B', label: 'Table B' }
                ],
                [{ source: 'A', target: 'B' }]
            );

            const result = filters.filterDownstream(graph, 'B');

            expect(result.nodes.map(n => n.id)).toEqual(['B']);
            expect(result.edges).toHaveLength(0);
        });
    });

    describe('filterByType', () => {
        it('filters nodes by single type', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', type: 'table', label: 'Table 1' },
                    { id: 'V1', type: 'view', label: 'View 1' },
                    { id: 'T2', type: 'table', label: 'Table 2' },
                    { id: 'E1', type: 'external', label: 'External 1' }
                ],
                [
                    { source: 'T1', target: 'V1' },
                    { source: 'T2', target: 'V1' },
                    { source: 'V1', target: 'E1' }
                ]
            );

            const result = filters.filterByType(graph, ['table']);

            expect(result.nodes.map(n => n.id).sort()).toEqual(['T1', 'T2']);
            expect(result.edges).toHaveLength(0); // No edges between tables
        });

        it('filters nodes by multiple types', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', type: 'table', label: 'Table 1' },
                    { id: 'V1', type: 'view', label: 'View 1' },
                    { id: 'E1', type: 'external', label: 'External 1' }
                ],
                [
                    { source: 'T1', target: 'V1' },
                    { source: 'V1', target: 'E1' }
                ]
            );

            const result = filters.filterByType(graph, ['table', 'view']);

            expect(result.nodes.map(n => n.id).sort()).toEqual(['T1', 'V1']);
            expect(result.edges).toHaveLength(1);
        });

        it('preserves edges only between remaining nodes', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', type: 'table' },
                    { id: 'V1', type: 'view' },
                    { id: 'T2', type: 'table' }
                ],
                [
                    { source: 'T1', target: 'V1' },
                    { source: 'V1', target: 'T2' }
                ]
            );

            const result = filters.filterByType(graph, ['table']);

            // Edges go through V1, so no direct edges between tables
            expect(result.edges).toHaveLength(0);
        });

        it('returns empty graph for non-existent type', () => {
            const graph = createTestGraph(
                [{ id: 'T1', type: 'table' }],
                []
            );

            const result = filters.filterByType(graph, ['column']);

            expect(result.nodes).toHaveLength(0);
        });
    });

    describe('filterBySearch', () => {
        it('filters by label (case-insensitive by default)', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', label: 'users' },
                    { id: 'T2', label: 'ORDERS' },
                    { id: 'T3', label: 'products' }
                ],
                []
            );

            const result = filters.filterBySearch(graph, 'user');

            expect(result.nodes.map(n => n.id)).toEqual(['T1']);
        });

        it('supports case-sensitive search', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', label: 'Users' },
                    { id: 'T2', label: 'users' }
                ],
                []
            );

            const result = filters.filterBySearch(graph, 'Users', { caseSensitive: true });

            expect(result.nodes.map(n => n.id)).toEqual(['T1']);
        });

        it('searches in metadata when enabled', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', label: 'table1', metadata: { description: 'User data' } },
                    { id: 'T2', label: 'table2', metadata: { description: 'Order data' } }
                ],
                []
            );

            const result = filters.filterBySearch(graph, 'User', { searchInMetadata: true });

            expect(result.nodes.map(n => n.id)).toEqual(['T1']);
        });

        it('searches only in labels by default', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', label: 'table1', metadata: { description: 'User data' } }
                ],
                []
            );

            const result = filters.filterBySearch(graph, 'User');

            expect(result.nodes).toHaveLength(0); // 'User' not in label
        });

        it('preserves edges between matching nodes', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', label: 'user_data' },
                    { id: 'T2', label: 'user_orders' },
                    { id: 'T3', label: 'products' }
                ],
                [
                    { source: 'T1', target: 'T2' },
                    { source: 'T2', target: 'T3' }
                ]
            );

            const result = filters.filterBySearch(graph, 'user');

            expect(result.nodes).toHaveLength(2);
            expect(result.edges).toHaveLength(1); // T1 -> T2
        });

        it('returns all nodes for empty search', () => {
            const graph = createTestGraph(
                [
                    { id: 'T1', label: 'users' },
                    { id: 'T2', label: 'orders' }
                ],
                []
            );

            const result = filters.filterBySearch(graph, '');

            expect(result.nodes).toHaveLength(2);
        });
    });

    describe('highlightPath', () => {
        it('highlights shortest path between nodes', () => {
            // Graph: A -> B -> C, A -> D -> C
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'A' },
                    { id: 'B', label: 'B' },
                    { id: 'C', label: 'C' },
                    { id: 'D', label: 'D' }
                ],
                [
                    { id: 'e1', source: 'A', target: 'B' },
                    { id: 'e2', source: 'B', target: 'C' },
                    { id: 'e3', source: 'A', target: 'D' },
                    { id: 'e4', source: 'D', target: 'C' }
                ]
            );

            const result = filters.highlightPath(graph, 'A', 'C');

            // All nodes should exist
            expect(result.nodes).toHaveLength(4);

            // Path nodes should be highlighted (A -> B -> C or A -> D -> C)
            const highlightedNodes = result.nodes.filter(n => n.highlighted);
            expect(highlightedNodes.length).toBeGreaterThanOrEqual(3);

            // Non-path nodes should be dimmed
            const dimmedNodes = result.nodes.filter(n => n.dimmed && !n.highlighted);
            expect(dimmedNodes.length).toBeLessThanOrEqual(1);
        });

        it('returns graph with all nodes dimmed when no path exists', () => {
            const graph = createTestGraph(
                [
                    { id: 'A', label: 'A' },
                    { id: 'B', label: 'B' }
                ],
                [] // No edges
            );

            const result = filters.highlightPath(graph, 'A', 'B');

            // Nodes should be dimmed
            expect(result.nodes.every(n => n.dimmed)).toBe(true);
        });

        it('highlights single node when source equals target', () => {
            const graph = createTestGraph(
                [{ id: 'A', label: 'A' }],
                []
            );

            const result = filters.highlightPath(graph, 'A', 'A');

            expect(result.nodes[0].highlighted).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles empty graph', () => {
            const graph = createTestGraph([], []);

            expect(filters.filterUpstream(graph, 'any').nodes).toHaveLength(0);
            expect(filters.filterDownstream(graph, 'any').nodes).toHaveLength(0);
            expect(filters.filterByType(graph, ['table']).nodes).toHaveLength(0);
            expect(filters.filterBySearch(graph, 'test').nodes).toHaveLength(0);
        });

        it('handles non-existent node ID', () => {
            const graph = createTestGraph(
                [{ id: 'A', label: 'A' }],
                []
            );

            const result = filters.filterUpstream(graph, 'nonexistent');

            // Should return just the (non-existent) focus node
            expect(result.nodes).toHaveLength(0);
        });
    });
});
