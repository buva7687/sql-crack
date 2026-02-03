/**
 * Tests for clustering utilities
 */

import {
    createClusters,
    filterNodesByClusters,
    filterEdgesByClusters,
    toggleCluster,
    expandAllClusters,
    collapseAllClusters,
    shouldCluster,
    getClusterForNode,
    getClusterColor,
    setClusteringConfig,
    getClusteringConfig,
    NodeCluster
} from '../../../src/webview/clustering';
import { FlowNode, FlowEdge } from '../../../src/webview/types';

describe('clustering', () => {
    // Reset config before each test
    beforeEach(() => {
        setClusteringConfig({
            minNodesForClustering: 30,
            enabled: true,
            defaultExpanded: false
        });
    });

    const createMockNode = (id: string, type: FlowNode['type'], x: number, y: number): FlowNode => ({
        id,
        type,
        label: `Node ${id}`,
        x,
        y,
        width: 180,
        height: 60
    });

    describe('createClusters', () => {
        it('should return empty array for small graphs', () => {
            const nodes = Array.from({ length: 20 }, (_, i) =>
                createMockNode(`n${i}`, 'table', i * 200, 0)
            );

            const clusters = createClusters(nodes);

            expect(clusters).toHaveLength(0);
        });

        it('should create clusters by node type', () => {
            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 0, 0),
                createMockNode('t2', 'table', 200, 0),
                createMockNode('j1', 'join', 100, 100),
                createMockNode('a1', 'aggregate', 300, 100),
                createMockNode('f1', 'filter', 150, 200)
            ];

            // Increase temp threshold for this test
            setClusteringConfig({ minNodesForClustering: 5 });
            const clusters = createClusters(nodes);

            expect(clusters.length).toBeGreaterThan(0);
            expect(clusters.some(c => c.type === 'tables')).toBe(true);
            expect(clusters.some(c => c.type === 'joins')).toBe(true);
            expect(clusters.some(c => c.type === 'aggregates')).toBe(true);
        });

        it('should group nodes by type correctly', () => {
            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 0, 0),
                createMockNode('t2', 'table', 200, 0),
                createMockNode('t3', 'table', 400, 0)
            ];

            setClusteringConfig({ minNodesForClustering: 3 });
            const clusters = createClusters(nodes);

            const tableCluster = clusters.find(c => c.type === 'tables');
            expect(tableCluster).toBeDefined();
            expect(tableCluster?.nodeIds).toEqual(['t1', 't2', 't3']);
            expect(tableCluster?.label).toBe('Tables (3)');
        });

        it('should calculate cluster bounds correctly', () => {
            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 100, 100),
                createMockNode('t2', 'table', 500, 100)
            ];

            setClusteringConfig({ minNodesForClustering: 2 });
            const clusters = createClusters(nodes);

            const tableCluster = clusters.find(c => c.type === 'tables');
            expect(tableCluster?.x).toBe(100);
            expect(tableCluster?.y).toBe(100);
            expect(tableCluster?.width).toBeGreaterThan(400); // Should span both nodes
        });

        it('should respect enabled config', () => {
            setClusteringConfig({ enabled: false });

            const nodes = Array.from({ length: 50 }, (_, i) =>
                createMockNode(`n${i}`, 'table', i * 200, 0)
            );

            const clusters = createClusters(nodes);

            expect(clusters).toHaveLength(0);
        });

        it('should handle multiple node types', () => {
            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 0, 0),
                createMockNode('t2', 'table', 200, 0),
                createMockNode('j1', 'join', 100, 100),
                createMockNode('j2', 'join', 300, 100),
                createMockNode('a1', 'aggregate', 200, 200),
                createMockNode('f1', 'filter', 100, 300),
                createMockNode('s1', 'sort', 300, 300)
            ];

            setClusteringConfig({ minNodesForClustering: 3 });
            const clusters = createClusters(nodes);

            expect(clusters.length).toBeGreaterThanOrEqual(4); // tables, joins, aggregates, filters, sorts
        });
    });

    describe('filterNodesByClusters', () => {
        it('should return all nodes when no clusters', () => {
            const nodes: FlowNode[] = [
                createMockNode('n1', 'table', 0, 0),
                createMockNode('n2', 'table', 200, 0)
            ];

            const filtered = filterNodesByClusters(nodes, []);

            expect(filtered).toHaveLength(2);
        });

        it('should hide nodes in collapsed clusters', () => {
            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 0, 0),
                createMockNode('t2', 'table', 200, 0),
                createMockNode('j1', 'join', 100, 100)
            ];

            const clusters: NodeCluster[] = [
                {
                    id: 'cluster-tables',
                    label: 'Tables (2)',
                    type: 'tables',
                    nodeIds: ['t1', 't2'],
                    expanded: false,
                    x: 0,
                    y: 0,
                    width: 400,
                    height: 60
                }
            ];

            const filtered = filterNodesByClusters(nodes, clusters);

            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('j1');
        });

        it('should show nodes in expanded clusters', () => {
            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 0, 0),
                createMockNode('t2', 'table', 200, 0),
                createMockNode('j1', 'join', 100, 100)
            ];

            const clusters: NodeCluster[] = [
                {
                    id: 'cluster-tables',
                    label: 'Tables (2)',
                    type: 'tables',
                    nodeIds: ['t1', 't2'],
                    expanded: true,
                    x: 0,
                    y: 0,
                    width: 400,
                    height: 60
                }
            ];

            const filtered = filterNodesByClusters(nodes, clusters);

            expect(filtered).toHaveLength(3);
        });

        it('should handle mixed cluster states', () => {
            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 0, 0),
                createMockNode('t2', 'table', 200, 0),
                createMockNode('j1', 'join', 100, 100),
                createMockNode('j2', 'join', 300, 100),
                createMockNode('a1', 'aggregate', 200, 200)
            ];

            const clusters: NodeCluster[] = [
                {
                    id: 'cluster-tables',
                    label: 'Tables (2)',
                    type: 'tables',
                    nodeIds: ['t1', 't2'],
                    expanded: false,
                    x: 0,
                    y: 0,
                    width: 400,
                    height: 60
                },
                {
                    id: 'cluster-joins',
                    label: 'Joins (2)',
                    type: 'joins',
                    nodeIds: ['j1', 'j2'],
                    expanded: true,
                    x: 100,
                    y: 100,
                    width: 400,
                    height: 60
                }
            ];

            const filtered = filterNodesByClusters(nodes, clusters);

            expect(filtered).toHaveLength(3); // j1, j2, a1
            expect(filtered.some(n => n.id === 't1')).toBe(false);
            expect(filtered.some(n => n.id === 'j1')).toBe(true);
        });
    });

    describe('filterEdgesByClusters', () => {
        it('should return all edges when no clusters', () => {
            const edges: FlowEdge[] = [
                { id: 'e1', source: 'n1', target: 'n2' },
                { id: 'e2', source: 'n2', target: 'n3' }
            ];

            const nodes: FlowNode[] = [
                createMockNode('n1', 'table', 0, 0),
                createMockNode('n2', 'table', 200, 0),
                createMockNode('n3', 'table', 400, 0)
            ];

            const filtered = filterEdgesByClusters(edges, nodes);

            expect(filtered).toHaveLength(2);
        });

        it('should filter edges to visible nodes only', () => {
            const edges: FlowEdge[] = [
                { id: 'e1', source: 't1', target: 't2' },
                { id: 'e2', source: 't2', target: 'j1' },
                { id: 'e3', source: 'j1', target: 'a1' }
            ];

            const nodes: FlowNode[] = [
                createMockNode('t1', 'table', 0, 0),
                createMockNode('j1', 'join', 100, 100)
            ];

            const filtered = filterEdgesByClusters(edges, nodes);

            expect(filtered).toHaveLength(0); // Both edges reference hidden nodes
        });

        it('should keep edges between visible nodes', () => {
            const edges: FlowEdge[] = [
                { id: 'e1', source: 'j1', target: 'j2' },
                { id: 'e2', source: 'j2', target: 'a1' }
            ];

            const nodes: FlowNode[] = [
                createMockNode('j1', 'join', 0, 0),
                createMockNode('j2', 'join', 200, 0),
                createMockNode('a1', 'aggregate', 400, 0)
            ];

            const filtered = filterEdgesByClusters(edges, nodes);

            expect(filtered).toHaveLength(2);
        });
    });

    describe('toggleCluster', () => {
        it('should toggle cluster expansion', () => {
            const clusters: NodeCluster[] = [
                {
                    id: 'c1',
                    label: 'Cluster 1',
                    type: 'tables',
                    nodeIds: ['n1', 'n2'],
                    expanded: false,
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 100
                }
            ];

            const toggled = toggleCluster(clusters[0], clusters);

            expect(toggled[0].expanded).toBe(true);
        });

        it('should not affect other clusters', () => {
            const clusters: NodeCluster[] = [
                {
                    id: 'c1',
                    label: 'Cluster 1',
                    type: 'tables',
                    nodeIds: ['n1', 'n2'],
                    expanded: false,
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 100
                },
                {
                    id: 'c2',
                    label: 'Cluster 2',
                    type: 'joins',
                    nodeIds: ['n3', 'n4'],
                    expanded: false,
                    x: 200,
                    y: 0,
                    width: 200,
                    height: 100
                }
            ];

            const toggled = toggleCluster(clusters[0], clusters);

            expect(toggled[0].expanded).toBe(true);
            expect(toggled[1].expanded).toBe(false);
        });
    });

    describe('expandAllClusters', () => {
        it('should expand all clusters', () => {
            const clusters: NodeCluster[] = [
                {
                    id: 'c1',
                    label: 'Cluster 1',
                    type: 'tables',
                    nodeIds: ['n1', 'n2'],
                    expanded: false,
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 100
                },
                {
                    id: 'c2',
                    label: 'Cluster 2',
                    type: 'joins',
                    nodeIds: ['n3', 'n4'],
                    expanded: false,
                    x: 200,
                    y: 0,
                    width: 200,
                    height: 100
                }
            ];

            const expanded = expandAllClusters(clusters);

            expect(expanded[0].expanded).toBe(true);
            expect(expanded[1].expanded).toBe(true);
        });
    });

    describe('collapseAllClusters', () => {
        it('should collapse all clusters', () => {
            const clusters: NodeCluster[] = [
                {
                    id: 'c1',
                    label: 'Cluster 1',
                    type: 'tables',
                    nodeIds: ['n1', 'n2'],
                    expanded: true,
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 100
                },
                {
                    id: 'c2',
                    label: 'Cluster 2',
                    type: 'joins',
                    nodeIds: ['n3', 'n4'],
                    expanded: true,
                    x: 200,
                    y: 0,
                    width: 200,
                    height: 100
                }
            ];

            const collapsed = collapseAllClusters(clusters);

            expect(collapsed[0].expanded).toBe(false);
            expect(collapsed[1].expanded).toBe(false);
        });
    });

    describe('shouldCluster', () => {
        it('should return false for small graphs', () => {
            expect(shouldCluster(20)).toBe(false);
            expect(shouldCluster(29)).toBe(false);
        });

        it('should return true for large graphs', () => {
            expect(shouldCluster(30)).toBe(true);
            expect(shouldCluster(100)).toBe(true);
        });

        it('should respect config threshold', () => {
            setClusteringConfig({ minNodesForClustering: 50 });

            expect(shouldCluster(30)).toBe(false);
            expect(shouldCluster(49)).toBe(false);
            expect(shouldCluster(50)).toBe(true);
        });

        it('should return false when disabled', () => {
            setClusteringConfig({ enabled: false });

            expect(shouldCluster(100)).toBe(false);
        });
    });

    describe('getClusterForNode', () => {
        it('should return cluster containing node', () => {
            const clusters: NodeCluster[] = [
                {
                    id: 'c1',
                    label: 'Cluster 1',
                    type: 'tables',
                    nodeIds: ['n1', 'n2', 'n3'],
                    expanded: false,
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 100
                }
            ];

            const cluster = getClusterForNode('n2', clusters);

            expect(cluster).toBeDefined();
            expect(cluster?.id).toBe('c1');
        });

        it('should return undefined for node not in any cluster', () => {
            const clusters: NodeCluster[] = [
                {
                    id: 'c1',
                    label: 'Cluster 1',
                    type: 'tables',
                    nodeIds: ['n1', 'n2'],
                    expanded: false,
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 100
                }
            ];

            const cluster = getClusterForNode('n3', clusters);

            expect(cluster).toBeUndefined();
        });
    });

    describe('getClusterColor', () => {
        it('should return color for each cluster type', () => {
            expect(getClusterColor('tables')).toBe('#4CAF50');
            expect(getClusterColor('joins')).toBe('#2196F3');
            expect(getClusterColor('filters')).toBe('#FF9800');
            expect(getClusterColor('aggregates')).toBe('#9C27B0');
        });

        it('should return color for all cluster types', () => {
            const types = [
                'tables', 'joins', 'filters', 'aggregates', 'sorts',
                'ctes', 'subqueries', 'windows', 'unions', 'cases', 'other'
            ] as const;

            for (const type of types) {
                const color = getClusterColor(type);
                expect(color).toBeDefined();
                expect(/^#[0-9A-F]{6}$/i.test(color)).toBe(true);
            }
        });
    });

    describe('config', () => {
        it('should get default config', () => {
            const config = getClusteringConfig();

            expect(config.minNodesForClustering).toBe(30);
            expect(config.enabled).toBe(true);
            expect(config.defaultExpanded).toBe(false);
        });

        it('should update config partially', () => {
            setClusteringConfig({ minNodesForClustering: 50 });
            const config = getClusteringConfig();

            expect(config.minNodesForClustering).toBe(50);
            expect(config.enabled).toBe(true); // Unchanged
        });

        it('should return copy of config', () => {
            const config1 = getClusteringConfig();
            config1.minNodesForClustering = 999;
            const config2 = getClusteringConfig();

            expect(config2.minNodesForClustering).toBe(30); // Original value
        });
    });
});
