/**
 * FlowAnalyzer Tests
 *
 * Tests for graph traversal: upstream, downstream, paths, roots, terminals, cycles.
 */

import { FlowAnalyzer } from '../../../../src/workspace/lineage/flowAnalyzer';
import { LineageGraph, LineageNode, LineageEdge, LineagePath } from '../../../../src/workspace/lineage/types';

// --- Helpers ---

function makeNode(id: string, type: LineageNode['type'] = 'table', name?: string, extra?: Partial<LineageNode>): LineageNode {
    return { id, type, name: name ?? id, metadata: {}, ...extra };
}

function makeEdge(sourceId: string, targetId: string, type: LineageEdge['type'] = 'direct'): LineageEdge {
    return { id: `${sourceId}->${targetId}`, sourceId, targetId, type, metadata: {} };
}

function createMockGraph(nodes: LineageNode[], edges: LineageEdge[]): LineageGraph {
    const nodeMap = new Map<string, LineageNode>();
    for (const n of nodes) { nodeMap.set(n.id, n); }
    return {
        nodes: nodeMap,
        edges,
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => []
    };
}

// --- Tests ---

describe('FlowAnalyzer', () => {
    // A -> B -> C (linear chain)
    const chainNodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const chainEdges = [makeEdge('A', 'B'), makeEdge('B', 'C')];

    describe('getUpstream', () => {
        it('returns empty for root node', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('A');
            expect(result.nodes).toHaveLength(0);
        });

        it('follows a linear chain', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('C');
            expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B']);
        });

        it('respects maxDepth=1', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('C', { maxDepth: 1 });
            expect(result.nodes.map(n => n.id)).toEqual(['B']);
        });

        it('handles diamond graph', () => {
            //   A
            //  / \
            // B   C
            //  \ /
            //   D
            const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')];
            const edges = [
                makeEdge('A', 'B'), makeEdge('A', 'C'),
                makeEdge('B', 'D'), makeEdge('C', 'D')
            ];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('D');
            expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C']);
        });

        it('handles cycle without infinite loop', () => {
            const nodes = [makeNode('A'), makeNode('B')];
            const edges = [makeEdge('A', 'B'), makeEdge('B', 'A')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('B');
            // Should find A without looping forever
            expect(result.nodes.map(n => n.id)).toEqual(['A']);
        });

        it('filters by node type', () => {
            const nodes = [
                makeNode('t1', 'table'), makeNode('v1', 'view'), makeNode('t2', 'table')
            ];
            const edges = [makeEdge('t1', 't2'), makeEdge('v1', 't2')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('t2', { filterTypes: ['table'] });
            expect(result.nodes.map(n => n.id)).toEqual(['t1']);
        });

        it('excludes external nodes', () => {
            const nodes = [makeNode('ext', 'external'), makeNode('t1', 'table'), makeNode('t2', 'table')];
            const edges = [makeEdge('ext', 't2'), makeEdge('t1', 't2')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('t2', { excludeExternal: true });
            expect(result.nodes.map(n => n.id)).toEqual(['t1']);
        });

        it('returns edges along with nodes', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('C');
            expect(result.edges.length).toBeGreaterThan(0);
        });

        it('returns nonzero depth for chains', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getUpstream('C');
            expect(result.depth).toBeGreaterThanOrEqual(1);
        });
    });

    describe('getDownstream', () => {
        it('returns empty for terminal node', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getDownstream('C');
            expect(result.nodes).toHaveLength(0);
        });

        it('follows a linear chain', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getDownstream('A');
            expect(result.nodes.map(n => n.id).sort()).toEqual(['B', 'C']);
        });

        it('respects maxDepth=1', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getDownstream('A', { maxDepth: 1 });
            expect(result.nodes.map(n => n.id)).toEqual(['B']);
        });

        it('excludes external nodes', () => {
            const nodes = [makeNode('t1', 'table'), makeNode('ext', 'external')];
            const edges = [makeEdge('t1', 'ext')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getDownstream('t1', { excludeExternal: true });
            expect(result.nodes).toHaveLength(0);
        });

        it('filters by type', () => {
            const nodes = [makeNode('A', 'table'), makeNode('B', 'view'), makeNode('C', 'table')];
            const edges = [makeEdge('A', 'B'), makeEdge('A', 'C')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const result = fa.getDownstream('A', { filterTypes: ['view'] });
            expect(result.nodes.map(n => n.id)).toEqual(['B']);
        });
    });

    describe('getPathBetween', () => {
        it('finds a direct path', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const paths = fa.getPathBetween('A', 'B');
            expect(paths).toHaveLength(1);
            expect(paths[0].nodes.map(n => n.id)).toEqual(['A', 'B']);
        });

        it('finds a multi-hop path', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const paths = fa.getPathBetween('A', 'C');
            expect(paths).toHaveLength(1);
            expect(paths[0].nodes.map(n => n.id)).toEqual(['A', 'B', 'C']);
        });

        it('returns empty for disconnected nodes', () => {
            const nodes = [makeNode('A'), makeNode('B')];
            const graph = createMockGraph(nodes, []);
            const fa = new FlowAnalyzer(graph);
            const paths = fa.getPathBetween('A', 'B');
            expect(paths).toHaveLength(0);
        });

        it('finds multiple paths in diamond', () => {
            const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')];
            const edges = [
                makeEdge('A', 'B'), makeEdge('A', 'C'),
                makeEdge('B', 'D'), makeEdge('C', 'D')
            ];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const paths = fa.getPathBetween('A', 'D');
            expect(paths).toHaveLength(2);
        });

        it('returns empty for nonexistent source', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const paths = fa.getPathBetween('Z', 'C');
            expect(paths).toHaveLength(0);
        });
    });

    describe('findRootSources', () => {
        it('finds nodes with no incoming edges', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const roots = fa.findRootSources();
            expect(roots.map(n => n.id)).toEqual(['A']);
        });

        it('excludes external nodes', () => {
            const nodes = [makeNode('ext', 'external'), makeNode('A', 'table')];
            const graph = createMockGraph(nodes, []);
            const fa = new FlowAnalyzer(graph);
            const roots = fa.findRootSources();
            expect(roots.map(n => n.id)).toEqual(['A']);
        });

        it('returns multiple roots', () => {
            const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
            const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const roots = fa.findRootSources();
            expect(roots.map(n => n.id).sort()).toEqual(['A', 'B']);
        });
    });

    describe('findTerminalNodes', () => {
        it('finds nodes with no outgoing edges', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const terminals = fa.findTerminalNodes();
            expect(terminals.map(n => n.id)).toEqual(['C']);
        });

        it('excludes external nodes', () => {
            const nodes = [makeNode('ext', 'external'), makeNode('C', 'table')];
            const graph = createMockGraph(nodes, []);
            const fa = new FlowAnalyzer(graph);
            const terminals = fa.findTerminalNodes();
            expect(terminals.map(n => n.id)).toEqual(['C']);
        });

        it('returns multiple terminals', () => {
            const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
            const edges = [makeEdge('A', 'B'), makeEdge('A', 'C')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const terminals = fa.findTerminalNodes();
            expect(terminals.map(n => n.id).sort()).toEqual(['B', 'C']);
        });
    });

    describe('detectCycles', () => {
        it('returns empty for acyclic graph', () => {
            const graph = createMockGraph(chainNodes, chainEdges);
            const fa = new FlowAnalyzer(graph);
            const cycles = fa.detectCycles();
            expect(cycles).toHaveLength(0);
        });

        it('detects a 2-node cycle', () => {
            const nodes = [makeNode('A'), makeNode('B')];
            const edges = [makeEdge('A', 'B'), makeEdge('B', 'A')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const cycles = fa.detectCycles();
            expect(cycles.length).toBeGreaterThan(0);
        });

        it('detects a 3-node cycle', () => {
            const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
            const edges = [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')];
            const graph = createMockGraph(nodes, edges);
            const fa = new FlowAnalyzer(graph);
            const cycles = fa.detectCycles();
            expect(cycles.length).toBeGreaterThan(0);
        });
    });
});
