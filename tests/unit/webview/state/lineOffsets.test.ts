import { applyLineOffsetToResult } from '../../../../src/webview/state/lineOffsets';
import type { FlowEdge, FlowNode, ParseResult, QueryStats } from '../../../../src/webview/types';

function createStats(): QueryStats {
    return {
        tables: 0,
        joins: 0,
        subqueries: 0,
        ctes: 0,
        aggregations: 0,
        windowFunctions: 0,
        unions: 0,
        conditions: 0,
        complexity: 'Simple',
        complexityScore: 0,
    };
}

function createNode(id: string, startLine?: number, endLine?: number): FlowNode {
    return {
        id,
        type: 'table',
        label: id.toUpperCase(),
        x: 0,
        y: 0,
        width: 120,
        height: 48,
        ...(typeof startLine === 'number' ? { startLine } : {}),
        ...(typeof endLine === 'number' ? { endLine } : {}),
    };
}

function createEdge(id: string, source: string, target: string, startLine?: number, endLine?: number): FlowEdge {
    return {
        id,
        source,
        target,
        ...(typeof startLine === 'number' ? { startLine } : {}),
        ...(typeof endLine === 'number' ? { endLine } : {}),
    };
}

function createResult(nodes: FlowNode[], edges: FlowEdge[]): ParseResult {
    return {
        nodes,
        edges,
        stats: createStats(),
        hints: [],
        sql: 'SELECT 1',
        columnLineage: [],
        columnFlows: [],
        tableUsage: new Map<string, number>(),
    };
}

describe('line offset helpers', () => {
    it('applies offset to top-level nodes and edges', () => {
        const result = createResult(
            [createNode('users', 2, 2), createNode('orders', 5, 5)],
            [createEdge('e1', 'users', 'orders', 6, 6)]
        );

        applyLineOffsetToResult(result, 10);

        expect(result.nodes[0].startLine).toBe(12);
        expect(result.nodes[0].endLine).toBe(12);
        expect(result.nodes[1].startLine).toBe(15);
        expect(result.edges[0].startLine).toBe(16);
        expect(result.edges[0].endLine).toBe(16);
    });

    it('applies offset recursively to child nodes and child edges', () => {
        const child = createNode('child_table', 3, 3);
        const cloudNode: FlowNode = {
            ...createNode('cte_node', 1, 1),
            type: 'cte',
            children: [child],
            childEdges: [createEdge('child-edge', 'cte_node', 'child_table', 4, 4)],
        };
        const result = createResult([cloudNode], []);

        applyLineOffsetToResult(result, 7);

        expect(result.nodes[0].startLine).toBe(8);
        expect(result.nodes[0].children?.[0].startLine).toBe(10);
        expect(result.nodes[0].childEdges?.[0].startLine).toBe(11);
        expect(result.nodes[0].childEdges?.[0].endLine).toBe(11);
    });

    it('ignores undefined metadata and non-positive offsets', () => {
        const result = createResult(
            [createNode('plain_node')],
            [createEdge('e2', 'a', 'b')]
        );

        applyLineOffsetToResult(result, 0);
        applyLineOffsetToResult(result, -2);

        expect(result.nodes[0].startLine).toBeUndefined();
        expect(result.edges[0].startLine).toBeUndefined();
    });
});
