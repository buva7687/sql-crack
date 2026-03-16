import { calculateEnhancedMetrics } from '../../../../src/webview/parser/hints/metrics';
import { createFreshContext } from '../../../../src/webview/parser/context';
import type { FlowNode, FlowEdge } from '../../../../src/webview/types';

function makeNode(overrides: Partial<FlowNode>): FlowNode {
    return {
        id: 'n1',
        type: 'table',
        label: 'test',
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        columns: [],
        ...overrides,
    } as FlowNode;
}

function makeEdge(source: string, target: string): FlowEdge {
    return { source, target } as FlowEdge;
}

describe('calculateEnhancedMetrics', () => {
    it('calculates max CTE depth', () => {
        const ctx = createFreshContext('PostgreSQL');
        const nodes = [
            makeNode({ id: 'cte1', type: 'cte', label: 'WITH a', depth: 1 }),
            makeNode({ id: 'cte2', type: 'cte', label: 'WITH b', depth: 3 }),
            makeNode({ id: 't1', type: 'table', label: 'users' }),
        ];
        calculateEnhancedMetrics(ctx, nodes, []);
        expect(ctx.stats.maxCteDepth).toBe(3);
    });

    it('returns 0 CTE depth when no CTEs', () => {
        const ctx = createFreshContext('PostgreSQL');
        calculateEnhancedMetrics(ctx, [makeNode({})], []);
        expect(ctx.stats.maxCteDepth).toBe(0);
    });

    it('calculates max fan-out from edges', () => {
        const ctx = createFreshContext('PostgreSQL');
        const nodes = [
            makeNode({ id: 'a' }),
            makeNode({ id: 'b' }),
            makeNode({ id: 'c' }),
            makeNode({ id: 'd' }),
        ];
        const edges = [
            makeEdge('a', 'b'),
            makeEdge('a', 'c'),
            makeEdge('a', 'd'),
            makeEdge('b', 'c'),
        ];
        calculateEnhancedMetrics(ctx, nodes, edges);
        expect(ctx.stats.maxFanOut).toBe(3); // node 'a' has 3 outgoing
    });

    it('calculates critical path length', () => {
        const ctx = createFreshContext('PostgreSQL');
        const nodes = [
            makeNode({ id: 'a' }),
            makeNode({ id: 'b' }),
            makeNode({ id: 'c' }),
            makeNode({ id: 'd' }),
        ];
        // a -> b -> c -> d (path length 4)
        const edges = [
            makeEdge('a', 'b'),
            makeEdge('b', 'c'),
            makeEdge('c', 'd'),
        ];
        calculateEnhancedMetrics(ctx, nodes, edges);
        expect(ctx.stats.criticalPathLength).toBe(4);
    });

    it('handles cyclic edges without infinite loop', () => {
        const ctx = createFreshContext('PostgreSQL');
        const nodes = [
            makeNode({ id: 'a' }),
            makeNode({ id: 'b' }),
        ];
        const edges = [
            makeEdge('a', 'b'),
            makeEdge('b', 'a'),
        ];
        calculateEnhancedMetrics(ctx, nodes, edges);
        // Both nodes have incoming edges, so no root nodes exist → path length 0
        expect(ctx.stats.criticalPathLength).toBe(0);
    });

    it('computes complexity breakdown', () => {
        const ctx = createFreshContext('PostgreSQL');
        ctx.stats.joins = 4;
        ctx.stats.subqueries = 2;
        ctx.stats.ctes = 1;
        ctx.stats.aggregations = 3;
        ctx.stats.windowFunctions = 1;

        calculateEnhancedMetrics(ctx, [], []);

        expect(ctx.stats.complexityBreakdown).toEqual({
            joins: 12,         // 4 * 3
            subqueries: 4,     // 2 * 2
            ctes: 2,           // 1 * 2
            aggregations: 3,   // 3 * 1
            windowFunctions: 2 // 1 * 2
        });
    });

    it('adds fan-out warning to nodes with 3+ outgoing edges', () => {
        const ctx = createFreshContext('PostgreSQL');
        const hub = makeNode({ id: 'hub' });
        const nodes = [hub, makeNode({ id: 'a' }), makeNode({ id: 'b' }), makeNode({ id: 'c' })];
        const edges = [makeEdge('hub', 'a'), makeEdge('hub', 'b'), makeEdge('hub', 'c')];

        calculateEnhancedMetrics(ctx, nodes, edges);

        expect(hub.warnings).toBeDefined();
        const fanOutWarning = hub.warnings!.find(w => w.type === 'fan-out');
        expect(fanOutWarning).toBeDefined();
        expect(fanOutWarning!.severity).toBe('medium');
    });

    it('marks fan-out >= 5 as high severity', () => {
        const ctx = createFreshContext('PostgreSQL');
        const hub = makeNode({ id: 'hub' });
        const targets = Array.from({ length: 5 }, (_, i) => makeNode({ id: `t${i}` }));
        const edges = targets.map(t => makeEdge('hub', t.id));

        calculateEnhancedMetrics(ctx, [hub, ...targets], edges);

        const fanOutWarning = hub.warnings!.find(w => w.type === 'fan-out');
        expect(fanOutWarning!.severity).toBe('high');
    });

    it('adds complex warning to join nodes when joins > 3', () => {
        const ctx = createFreshContext('PostgreSQL');
        ctx.stats.joins = 5;
        const joinNode = makeNode({ id: 'j1', type: 'join', label: 'JOIN' });
        calculateEnhancedMetrics(ctx, [joinNode], []);

        const complexWarning = joinNode.warnings?.find(w => w.type === 'complex');
        expect(complexWarning).toBeDefined();
    });

    it('adds complex warning to aggregate nodes with > 3 functions', () => {
        const ctx = createFreshContext('PostgreSQL');
        const aggNode = makeNode({
            id: 'a1',
            type: 'aggregate',
            label: 'AGG',
            aggregateDetails: {
                functions: [
                    { name: 'COUNT', expression: 'COUNT(*)' },
                    { name: 'SUM', expression: 'SUM(a)' },
                    { name: 'AVG', expression: 'AVG(b)' },
                    { name: 'MAX', expression: 'MAX(c)' },
                ],
                groupBy: [],
            },
        } as any);
        calculateEnhancedMetrics(ctx, [aggNode], []);

        const complexWarning = aggNode.warnings?.find(w => w.type === 'complex');
        expect(complexWarning).toBeDefined();
    });

    it('assigns complexity levels to join nodes', () => {
        const ctx = createFreshContext('PostgreSQL');
        ctx.stats.joins = 6;
        const joinNode = makeNode({ id: 'j1', type: 'join', label: 'JOIN' });
        calculateEnhancedMetrics(ctx, [joinNode], []);
        expect(joinNode.complexityLevel).toBe('high');

        const ctx2 = createFreshContext('PostgreSQL');
        ctx2.stats.joins = 3;
        const joinNode2 = makeNode({ id: 'j2', type: 'join', label: 'JOIN' });
        calculateEnhancedMetrics(ctx2, [joinNode2], []);
        expect(joinNode2.complexityLevel).toBe('medium');

        const ctx3 = createFreshContext('PostgreSQL');
        ctx3.stats.joins = 1;
        const joinNode3 = makeNode({ id: 'j3', type: 'join', label: 'JOIN' });
        calculateEnhancedMetrics(ctx3, [joinNode3], []);
        expect(joinNode3.complexityLevel).toBe('low');
    });

    it('assigns complexity levels to aggregate nodes based on function count', () => {
        const ctx = createFreshContext('PostgreSQL');
        const aggNode = makeNode({
            id: 'a1',
            type: 'aggregate',
            label: 'AGG',
            aggregateDetails: {
                functions: Array.from({ length: 5 }, (_, i) => ({ name: `F${i}`, expression: `F${i}()` })),
                groupBy: [],
            },
        } as any);
        calculateEnhancedMetrics(ctx, [aggNode], []);
        expect(aggNode.complexityLevel).toBe('high');
    });

    it('assigns complexity levels to subquery nodes', () => {
        const ctx = createFreshContext('PostgreSQL');
        ctx.stats.subqueries = 3;
        const subNode = makeNode({ id: 's1', type: 'subquery' as any, label: 'SUBQ' });
        calculateEnhancedMetrics(ctx, [subNode], []);
        expect(subNode.complexityLevel).toBe('high');

        const ctx2 = createFreshContext('PostgreSQL');
        ctx2.stats.subqueries = 1;
        const subNode2 = makeNode({ id: 's2', type: 'subquery' as any, label: 'SUBQ' });
        calculateEnhancedMetrics(ctx2, [subNode2], []);
        expect(subNode2.complexityLevel).toBe('low');
    });

    it('handles empty nodes and edges gracefully', () => {
        const ctx = createFreshContext('PostgreSQL');
        expect(() => calculateEnhancedMetrics(ctx, [], [])).not.toThrow();
        expect(ctx.stats.maxCteDepth).toBe(0);
        expect(ctx.stats.maxFanOut).toBe(0);
        expect(ctx.stats.criticalPathLength).toBe(0);
    });
});
