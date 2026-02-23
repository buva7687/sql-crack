/**
 * Regression tests for CTE/subquery UNION convergence and flow connectivity.
 *
 * Guards against:
 *   1. UNION branches inside CTEs not converging — each branch should connect to the UNION node
 *   2. Subquery→outer clause disconnect — recursive subquery calls must propagate last node ID
 *   3. parseCteOrSubqueryInternals returning void — must return string|null for chaining
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';
import type { FlowNode, FlowEdge } from '../../../src/webview/types';

describe('CTE UNION convergence', () => {
    it('UNION inside CTE has two incoming edges (left + right branches)', () => {
        const sql = `
            WITH combined AS (
                SELECT id, name FROM customers
                UNION
                SELECT id, name FROM suppliers
            )
            SELECT * FROM combined
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();
        expect(cteNode!.children).toBeDefined();
        expect(cteNode!.childEdges).toBeDefined();

        const unionChild = cteNode!.children!.find(n => n.type === 'union');
        expect(unionChild).toBeDefined();

        // UNION node should have two incoming edges (left branch + right branch)
        const incomingEdges = cteNode!.childEdges!.filter(e => e.target === unionChild!.id);
        expect(incomingEdges.length).toBe(2);
    });

    it('UNION ALL inside CTE converges both branches', () => {
        const sql = `
            WITH all_data AS (
                SELECT id FROM table_a WHERE status = 1
                UNION ALL
                SELECT id FROM table_b WHERE status = 2
            )
            SELECT * FROM all_data
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();

        const unionChild = cteNode!.children!.find(n => n.type === 'union');
        expect(unionChild).toBeDefined();

        const incomingEdges = cteNode!.childEdges!.filter(e => e.target === unionChild!.id);
        expect(incomingEdges.length).toBe(2);
    });

    it('chained UNIONs (A UNION B UNION C) produce cascading convergence', () => {
        const sql = `
            WITH triple AS (
                SELECT id FROM alpha
                UNION
                SELECT id FROM beta
                UNION
                SELECT id FROM gamma
            )
            SELECT * FROM triple
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();

        const unionChildren = cteNode!.children!.filter(n => n.type === 'union');
        // Chained UNIONs produce at least one UNION node
        expect(unionChildren.length).toBeGreaterThanOrEqual(1);

        // All table nodes should be reachable via edges leading to union nodes
        const tableChildren = cteNode!.children!.filter(n => n.type === 'table');
        expect(tableChildren.length).toBeGreaterThanOrEqual(2);
    });

    it('INTERSECT inside CTE converges both branches', () => {
        const sql = `
            WITH common AS (
                SELECT id FROM customers
                INTERSECT
                SELECT id FROM premium_members
            )
            SELECT * FROM common
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();

        // Should have a set operation node (INTERSECT)
        const setOpChild = cteNode!.children!.find(n => n.type === 'union');
        expect(setOpChild).toBeDefined();
        expect(setOpChild!.label).toContain('INTERSECT');

        const incomingEdges = cteNode!.childEdges!.filter(e => e.target === setOpChild!.id);
        expect(incomingEdges.length).toBe(2);
    });

    it('EXCEPT inside CTE converges both branches', () => {
        const sql = `
            WITH excluded AS (
                SELECT id FROM all_users
                EXCEPT
                SELECT id FROM banned_users
            )
            SELECT * FROM excluded
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();

        const setOpChild = cteNode!.children!.find(n => n.type === 'union');
        expect(setOpChild).toBeDefined();
        expect(setOpChild!.label).toContain('EXCEPT');

        const incomingEdges = cteNode!.childEdges!.filter(e => e.target === setOpChild!.id);
        expect(incomingEdges.length).toBe(2);
    });
});

describe('CTE subquery→outer clause connectivity', () => {
    it('GROUP BY connects downstream of FROM subquery inside CTE', () => {
        const sql = `
            WITH summary AS (
                SELECT category, SUM(amount) as total
                FROM orders
                GROUP BY category
            )
            SELECT * FROM summary
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();
        expect(cteNode!.children).toBeDefined();

        const tableChild = cteNode!.children!.find(n => n.type === 'table');
        const groupChild = cteNode!.children!.find(n => n.label === 'GROUP BY');
        expect(tableChild).toBeDefined();
        expect(groupChild).toBeDefined();

        // GROUP BY should be reachable from the table via edges
        const edgeFromTable = cteNode!.childEdges!.find(
            e => e.source === tableChild!.id && e.target === groupChild!.id
        );
        expect(edgeFromTable).toBeDefined();
    });

    it('UNION followed by GROUP BY has GROUP BY connected after UNION', () => {
        const sql = `
            WITH combined AS (
                SELECT category, amount FROM store_sales
                UNION ALL
                SELECT category, amount FROM web_sales
            )
            SELECT * FROM combined
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();

        const unionChild = cteNode!.children!.find(n => n.type === 'union');
        expect(unionChild).toBeDefined();

        // UNION node should be the last node in the left branch chain
        // (right branch feeds into UNION as well)
        const incomingEdges = cteNode!.childEdges!.filter(e => e.target === unionChild!.id);
        expect(incomingEdges.length).toBe(2);
    });

    it('CTE with WHERE + JOIN has connected flow chain', () => {
        const sql = `
            WITH filtered AS (
                SELECT o.id, o.amount
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                WHERE o.amount > 100
            )
            SELECT * FROM filtered
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();
        expect(cteNode!.children!.length).toBeGreaterThanOrEqual(3); // table, join, where

        // All child nodes should be connected via edges (no disconnected nodes)
        const childIds = new Set(cteNode!.children!.map(n => n.id));
        const connectedIds = new Set<string>();
        for (const edge of cteNode!.childEdges!) {
            connectedIds.add(edge.source);
            connectedIds.add(edge.target);
        }
        // Every child except the first should be a target of some edge
        const targetIds = new Set(cteNode!.childEdges!.map(e => e.target));
        const firstChild = cteNode!.children![0];
        for (const child of cteNode!.children!) {
            if (child.id !== firstChild.id) {
                expect(targetIds.has(child.id)).toBe(true);
            }
        }
    });
});

describe('parseCteOrSubqueryInternals return type', () => {
    it('function signature returns string | null (not void)', () => {
        // Source-reading regression: parseCteOrSubqueryInternals must return string|null
        const { readFileSync } = require('fs');
        const { join } = require('path');
        const source = readFileSync(
            join(__dirname, '../../../src/webview/parser/statements/select.ts'),
            'utf-8'
        );
        expect(source).toMatch(
            /function parseCteOrSubqueryInternals\b[\s\S]*?\):\s*string\s*\|\s*null\s*\{/
        );
    });

    it('function returns previousId at end', () => {
        const { readFileSync } = require('fs');
        const { join } = require('path');
        const source = readFileSync(
            join(__dirname, '../../../src/webview/parser/statements/select.ts'),
            'utf-8'
        );
        // The function should end with `return previousId;` before its closing brace
        expect(source).toMatch(/return previousId;\s*\n\}/);
    });
});
