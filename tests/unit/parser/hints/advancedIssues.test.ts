import { detectAdvancedIssues } from '../../../../src/webview/parser/hints/advancedIssues';
import { createFreshContext } from '../../../../src/webview/parser/context';
import type { FlowNode } from '../../../../src/webview/types';

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

describe('detectAdvancedIssues', () => {
    describe('unused CTE detection', () => {
        it('detects unused CTEs', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [
                makeNode({ id: 'cte1', type: 'cte', label: 'WITH unused_cte' }),
                makeNode({ id: 't1', type: 'table', label: 'orders' }),
                makeNode({ id: 's1', type: 'select', label: 'SELECT' }),
            ];
            const sql = 'WITH unused_cte AS (SELECT 1) SELECT * FROM orders';
            detectAdvancedIssues(ctx, nodes, sql);

            const unusedHint = ctx.hints.find(h => h.message.includes('unused_cte') && h.message.includes('Unused CTE'));
            expect(unusedHint).toBeDefined();
        });

        it('does not flag CTEs that are referenced', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [
                makeNode({ id: 'cte1', type: 'cte', label: 'WITH my_cte' }),
                makeNode({ id: 't1', type: 'table', label: 'my_cte' }),
                makeNode({ id: 's1', type: 'select', label: 'SELECT' }),
            ];
            const sql = 'WITH my_cte AS (SELECT 1) SELECT * FROM my_cte';
            detectAdvancedIssues(ctx, nodes, sql);

            const unusedHint = ctx.hints.find(h => h.message.includes('my_cte') && h.message.includes('Unused CTE'));
            expect(unusedHint).toBeUndefined();
        });

        it('handles WITH RECURSIVE prefix', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [
                makeNode({ id: 'cte1', type: 'cte', label: 'WITH RECURSIVE tree' }),
                makeNode({ id: 't1', type: 'table', label: 'tree' }),
            ];
            const sql = 'WITH RECURSIVE tree AS (SELECT 1 UNION ALL SELECT n+1 FROM tree) SELECT * FROM tree';
            detectAdvancedIssues(ctx, nodes, sql);

            const unusedHint = ctx.hints.find(h => h.message.includes('tree') && h.message.includes('Unused CTE'));
            expect(unusedHint).toBeUndefined();
        });
    });

    describe('duplicate subquery detection', () => {
        it('detects duplicate subqueries in WHERE clause', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [
                makeNode({ id: 't1', type: 'table', label: 'orders' }),
                makeNode({ id: 'f1', type: 'filter', label: 'WHERE' }),
                makeNode({ id: 's1', type: 'select', label: 'SELECT' }),
            ];
            const sql = `
                SELECT * FROM orders
                WHERE id IN (SELECT order_id FROM active_orders)
                AND customer_id IN (SELECT order_id FROM active_orders)
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            const dupHint = ctx.hints.find(h => h.message.includes('similar subqueries'));
            expect(dupHint).toBeDefined();
        });

        it('does not flag unique subqueries', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [
                makeNode({ id: 't1', type: 'table', label: 'orders' }),
                makeNode({ id: 's1', type: 'select', label: 'SELECT' }),
            ];
            const sql = `
                SELECT * FROM orders
                WHERE id IN (SELECT order_id FROM active_orders)
                AND customer_id IN (SELECT customer_id FROM customers WHERE active = true)
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            const dupHint = ctx.hints.find(h => h.message.includes('similar subqueries'));
            expect(dupHint).toBeUndefined();
        });
    });

    describe('dead column detection', () => {
        it('does not flag CTE outputs consumed by the outer query', () => {
            const ctx = createFreshContext('PostgreSQL');
            const selectNode = makeNode({
                id: 's1',
                type: 'select',
                label: 'SELECT',
                parentId: 'cte1',
                columns: [
                    { name: 'id', expression: 'id' },
                    { name: 'name', expression: 'name' },
                    { name: 'unused_col', expression: 'unused_col' },
                ],
            });
            const cteNode = makeNode({
                id: 'cte1',
                type: 'cte',
                label: 'WITH my_cte',
            });
            const nodes = [cteNode, selectNode];
            const sql = `
                WITH my_cte AS (
                    SELECT id, name, unused_col FROM users
                )
                SELECT id, name FROM my_cte WHERE id > 10 ORDER BY name
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            const deadWarnings = selectNode.warnings?.filter(w => w.type === 'dead-column') || [];
            expect(deadWarnings).toHaveLength(1);
            expect(deadWarnings[0].message).toContain('unused_col');

            const deadHint = ctx.hints.find(h => h.nodeId === selectNode.id && h.message.includes('dead column'));
            expect(deadHint?.message).toContain('unused_col');
            expect(deadHint?.message).not.toContain('id');
            expect(deadHint?.message).not.toContain('name');
        });

        it('recognizes CTE output usage through an outer table alias', () => {
            const ctx = createFreshContext('PostgreSQL');
            const selectNode = makeNode({
                id: 's1',
                type: 'select',
                label: 'SELECT',
                parentId: 'cte1',
                columns: [
                    { name: 'id', expression: 'id' },
                    { name: 'total', expression: 'total' },
                ],
            });
            const cteNode = makeNode({
                id: 'cte1',
                type: 'cte',
                label: 'WITH order_totals',
            });
            const nodes = [cteNode, selectNode];
            const sql = `
                WITH order_totals AS (
                    SELECT id, total FROM orders
                )
                SELECT ot.id
                FROM order_totals ot
                WHERE ot.total > 0
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            const deadWarnings = selectNode.warnings?.filter(w => w.type === 'dead-column') || [];
            expect(deadWarnings).toHaveLength(0);
        });

        it('ignores CTE-looking text inside string literals when finding downstream usage', () => {
            const ctx = createFreshContext('PostgreSQL');
            const selectNode = makeNode({
                id: 's1',
                type: 'select',
                label: 'SELECT',
                parentId: 'cte1',
                columns: [
                    { name: 'id', expression: 'id' },
                    { name: 'unused_col', expression: 'unused_col' },
                    { name: 'debug_text', expression: 'debug_text' },
                ],
            });
            const cteNode = makeNode({
                id: 'cte1',
                type: 'cte',
                label: 'WITH my_cte',
            });
            const nodes = [cteNode, selectNode];
            const sql = `
                WITH my_cte AS (
                    SELECT
                        id,
                        unused_col,
                        ') SELECT unused_col FROM my_cte' AS debug_text
                    FROM users
                )
                SELECT id
                FROM my_cte
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            const deadWarnings = selectNode.warnings?.filter(w => w.type === 'dead-column') || [];
            expect(deadWarnings.map(w => w.message)).toEqual(expect.arrayContaining([
                expect.stringContaining('unused_col'),
                expect.stringContaining('debug_text'),
            ]));
            expect(deadWarnings.some(w => w.message.includes('id'))).toBe(false);
        });

        it('skips dead column detection for top-level SELECT (no parentId)', () => {
            const ctx = createFreshContext('PostgreSQL');
            const selectNode = makeNode({
                id: 's1',
                type: 'select',
                label: 'SELECT',
                // no parentId — top-level
                columns: [
                    { name: 'id', expression: 'id' },
                    { name: 'never_used', expression: 'never_used' },
                ],
            });
            const nodes = [selectNode];
            const sql = 'SELECT id, never_used FROM users WHERE id > 10';
            detectAdvancedIssues(ctx, nodes, sql);

            // Top-level SELECT columns are output columns, not dead
            const deadHint = ctx.hints.find(h =>
                h.message.toLowerCase().includes('never_used') && h.message.toLowerCase().includes('unused')
            );
            expect(deadHint).toBeUndefined();
        });

        it('does not flag columns used in WHERE/ORDER BY/GROUP BY', () => {
            const ctx = createFreshContext('PostgreSQL');
            const selectNode = makeNode({
                id: 's1',
                type: 'select',
                label: 'SELECT',
                parentId: 'cte1',
                columns: [
                    { name: 'id', expression: 'id' },
                    { name: 'status', expression: 'status' },
                ],
            });
            const cteNode = makeNode({
                id: 'cte1',
                type: 'cte',
                label: 'WITH filtered',
            });
            const nodes = [cteNode, selectNode];
            const sql = `
                WITH filtered AS (
                    SELECT id, status FROM orders
                )
                SELECT id, status FROM filtered WHERE status = 'active' ORDER BY id GROUP BY status
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            // Both columns are used — no dead column warning expected
            const deadWarning = selectNode.warnings?.find(w => w.message.toLowerCase().includes('unused'));
            expect(deadWarning).toBeUndefined();
        });
    });

    describe('subquery location detection', () => {
        it('associates subquery in HAVING clause', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [
                makeNode({ id: 't1', type: 'table', label: 'orders' }),
                makeNode({ id: 'f1', type: 'filter', label: 'HAVING' }),
                makeNode({ id: 's1', type: 'select', label: 'SELECT' }),
            ];
            const sql = `
                SELECT customer_id, COUNT(*) as cnt FROM orders
                GROUP BY customer_id
                HAVING COUNT(*) > (SELECT AVG(order_count) FROM customer_summary)
                AND COUNT(*) > (SELECT AVG(order_count) FROM customer_summary)
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            const dupHint = ctx.hints.find(h => h.message.includes('similar subqueries'));
            expect(dupHint).toBeDefined();
        });

        it('associates subquery in SELECT clause', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [
                makeNode({ id: 't1', type: 'table', label: 'orders' }),
                makeNode({ id: 's1', type: 'select', label: 'SELECT' }),
            ];
            const sql = `
                SELECT
                    id,
                    (SELECT COUNT(*) FROM order_items WHERE order_items.order_id = orders.id) as item_count,
                    (SELECT COUNT(*) FROM order_items WHERE order_items.order_id = orders.id) as item_count2
                FROM orders
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            const dupHint = ctx.hints.find(h => h.message.includes('similar subqueries'));
            expect(dupHint).toBeDefined();
        });
    });

    describe('edge cases', () => {
        it('handles empty node list', () => {
            const ctx = createFreshContext('PostgreSQL');
            expect(() => detectAdvancedIssues(ctx, [], 'SELECT 1')).not.toThrow();
        });

        it('handles empty SQL string', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes = [makeNode({ type: 'select', label: 'SELECT' })];
            expect(() => detectAdvancedIssues(ctx, nodes, '')).not.toThrow();
        });

        it('handles SQL with only comments', () => {
            const ctx = createFreshContext('PostgreSQL');
            const nodes: FlowNode[] = [];
            expect(() => detectAdvancedIssues(ctx, nodes, '-- just a comment')).not.toThrow();
        });

        it('adds warning to subquery FROM node when duplicate detected', () => {
            const ctx = createFreshContext('PostgreSQL');
            const subNode1 = makeNode({ id: 'sub1', type: 'table', label: 'subquery' });
            const subNode2 = makeNode({ id: 'sub2', type: 'table', label: 'subquery' });
            const nodes = [
                makeNode({ id: 't1', type: 'table', label: 'orders' }),
                subNode1,
                subNode2,
                makeNode({ id: 'f1', type: 'filter', label: 'WHERE' }),
            ];
            // Two identical FROM subqueries (long enough to pass 15-char threshold)
            const sql = `
                SELECT * FROM orders
                JOIN (SELECT customer_id, SUM(amount) as total FROM payments GROUP BY customer_id) sub1 ON orders.customer_id = sub1.customer_id
                JOIN (SELECT customer_id, SUM(amount) as total FROM payments GROUP BY customer_id) sub2 ON orders.customer_id = sub2.customer_id
            `;
            detectAdvancedIssues(ctx, nodes, sql);

            // Should produce a duplicate hint
            const dupHint = ctx.hints.find(h => h.message.includes('similar subqueries'));
            expect(dupHint).toBeDefined();
        });
    });
});
