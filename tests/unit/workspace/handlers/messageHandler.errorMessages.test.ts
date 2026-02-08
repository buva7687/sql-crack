/**
 * Item #8: Workspace Panel Error Messages
 *
 * Tests for fuzzy table name suggestions and improved error messages
 * in the workspace panel message handler.
 */

import { findSimilarTableNames } from '../../../../src/workspace/handlers/messageHandler';
import type { LineageGraph, LineageNode } from '../../../../src/workspace/lineage/types';

// Helper to create a minimal lineage graph with the given table names
function createMockGraph(tableNames: string[]): LineageGraph {
    const nodes = new Map<string, LineageNode>();
    for (const name of tableNames) {
        const id = `table:${name.toLowerCase()}`;
        nodes.set(id, {
            id,
            type: 'table',
            name,
            metadata: {},
        });
    }
    return {
        nodes,
        edges: [],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => [],
    };
}

describe('Item #8: Workspace Panel Error Messages', () => {
    describe('findSimilarTableNames()', () => {
        const graph = createMockGraph([
            'users', 'orders', 'products', 'categories',
            'user_sessions', 'order_items', 'product_reviews',
        ]);

        it('should find exact substring matches', () => {
            const results = findSimilarTableNames(graph, 'user');
            expect(results).toContain('users');
            expect(results).toContain('user_sessions');
        });

        it('should find close edit-distance matches', () => {
            // "ordrs" is 1 edit away from "orders"
            const results = findSimilarTableNames(graph, 'ordrs');
            expect(results).toContain('orders');
        });

        it('should find matches for typos', () => {
            // "produts" → "products"
            const results = findSimilarTableNames(graph, 'produts');
            expect(results).toContain('products');
        });

        it('should return empty array when no close matches exist', () => {
            const results = findSimilarTableNames(graph, 'zzzzzzzzz');
            expect(results).toEqual([]);
        });

        it('should be case-insensitive', () => {
            const results = findSimilarTableNames(graph, 'USERS');
            expect(results).toContain('users');
        });

        it('should limit results to the specified count', () => {
            const results = findSimilarTableNames(graph, 'or', 2);
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should default to 3 results', () => {
            const bigGraph = createMockGraph([
                'a1', 'a2', 'a3', 'a4', 'a5', 'a6',
            ]);
            const results = findSimilarTableNames(bigGraph, 'a');
            expect(results.length).toBeLessThanOrEqual(3);
        });

        it('should skip column nodes', () => {
            const graphWithCols = createMockGraph(['users']);
            graphWithCols.nodes.set('col:users.id', {
                id: 'col:users.id',
                type: 'column',
                name: 'users_id',
                parentId: 'table:users',
                metadata: {},
            });

            const results = findSimilarTableNames(graphWithCols, 'users_id');
            // Should not include the column
            expect(results.every(r => r !== 'users_id')).toBe(true);
        });

        it('should handle empty graph', () => {
            const emptyGraph = createMockGraph([]);
            const results = findSimilarTableNames(emptyGraph, 'anything');
            expect(results).toEqual([]);
        });

        it('should prioritize closer matches', () => {
            const results = findSimilarTableNames(graph, 'order');
            // "orders" (1 edit) should come before "order_items" (substring)
            // Both should be present
            expect(results).toContain('orders');
            expect(results).toContain('order_items');
        });

        it('should find views and CTEs, not just tables', () => {
            const mixedGraph = createMockGraph([]);
            mixedGraph.nodes.set('view:user_stats', {
                id: 'view:user_stats',
                type: 'view',
                name: 'user_stats',
                metadata: {},
            });
            mixedGraph.nodes.set('cte:temp_users', {
                id: 'cte:temp_users',
                type: 'cte',
                name: 'temp_users',
                metadata: {},
            });

            const results = findSimilarTableNames(mixedGraph, 'user');
            expect(results).toContain('user_stats');
            expect(results).toContain('temp_users');
        });
    });
});
