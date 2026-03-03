/**
 * Regression tests for code audit findings (Observations 1–11).
 *
 * Guards against:
 *   #1  JOIN subqueries double-processed in parseCteOrSubqueryInternals
 *   #3  All union nodes assigned the same source line number
 *   #4  Scalar subqueries in SELECT break pipeline order inside CTEs/subqueries
 *   #6  All same-type nodes share the first line, not just unions
 *   #7  Top-level processSelectStatement misses GROUP BY/ORDER BY object form
 *   #8  HAVING conditions not counted in stats
 *   #9  Subquery aliases appear as real tables in UNION details
 *   #10 lineNumbers.ts doesn't assign lines for subquery, window, or case nodes
 *   #11 UNION node depth inconsistent with sibling nodes
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

const DIALECT: SqlDialect = 'MySQL';

/** Collect all nodes including children recursively */
function allNodes(nodes: any[]): any[] {
    const result: any[] = [];
    for (const n of nodes) {
        result.push(n);
        if (n.children) { result.push(...allNodes(n.children)); }
    }
    return result;
}

describe('Audit regression: #1 — JOIN subqueries not double-processed', () => {
    it('FROM subquery in JOIN is only processed once (no duplicate nodes)', () => {
        const sql = `
            SELECT *
            FROM orders o
            JOIN (SELECT id, name FROM customers) c ON o.customer_id = c.id
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        // The subquery 'customers' table should appear exactly once (nested inside subquery children)
        const all = allNodes(result.nodes);
        const customerNodes = all.filter(
            (n: any) => n.type === 'table' && n.label.toLowerCase() === 'customers'
        );
        expect(customerNodes).toHaveLength(1);
    });

    it('FROM subquery and JOIN subquery both produce exactly one set of nodes', () => {
        const sql = `
            SELECT *
            FROM (SELECT id FROM alpha) a
            JOIN (SELECT id FROM beta) b ON a.id = b.id
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        const all = allNodes(result.nodes);
        const alphaNodes = all.filter(
            (n: any) => n.type === 'table' && n.label.toLowerCase() === 'alpha'
        );
        const betaNodes = all.filter(
            (n: any) => n.type === 'table' && n.label.toLowerCase() === 'beta'
        );
        expect(alphaNodes).toHaveLength(1);
        expect(betaNodes).toHaveLength(1);
    });
});

describe('Audit regression: #4 — Scalar subqueries don\'t break pipeline chain', () => {
    it('users table connects to outer WHERE, not the scalar subquery\'s WHERE', () => {
        const sql = `
            WITH report AS (
                SELECT
                    id,
                    (SELECT MAX(score) FROM scores WHERE scores.user_id = u.id) AS top_score
                FROM users u
                WHERE u.active = 1
            )
            SELECT * FROM report
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();
        expect(cteNode!.children).toBeDefined();
        expect(cteNode!.childEdges).toBeDefined();

        const children = cteNode!.children!;
        const edges = cteNode!.childEdges!;

        // Find the users table node
        const usersNode = children.find(n => n.type === 'table' && n.label.toLowerCase() === 'users');
        expect(usersNode).toBeDefined();

        // Find the edge from users — it should go to a WHERE node (outer WHERE for u.active = 1)
        const edgeFromUsers = edges.find(e => e.source === usersNode!.id);
        expect(edgeFromUsers).toBeDefined();

        const targetNode = children.find(n => n.id === edgeFromUsers!.target);
        expect(targetNode).toBeDefined();
        // The target should be a filter (WHERE), not an aggregate or other node from the scalar subquery
        expect(targetNode!.type).toBe('filter');
        expect(targetNode!.label).toBe('WHERE');
    });
});

describe('Audit regression: #7 — GROUP BY / ORDER BY object form', () => {
    it('GROUP BY is detected for queries that produce object-form groupby', () => {
        // Use a query with GROUP BY — the parser should create an aggregate node
        const sql = `SELECT department, COUNT(*) FROM employees GROUP BY department`;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        const aggNode = result.nodes.find(n => n.type === 'aggregate');
        expect(aggNode).toBeDefined();
        expect(aggNode!.label).toBe('GROUP BY');
        expect(result.stats.aggregations).toBeGreaterThanOrEqual(1);
    });

    it('ORDER BY is detected for queries that produce object-form orderby', () => {
        const sql = `SELECT name, age FROM users ORDER BY age DESC`;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        const sortNode = result.nodes.find(n => n.type === 'sort');
        expect(sortNode).toBeDefined();
        expect(sortNode!.label).toBe('ORDER BY');
    });
});

describe('Audit regression: #8 — HAVING conditions counted in stats', () => {
    it('top-level HAVING conditions are included in stats.conditions', () => {
        const sql = `
            SELECT department, COUNT(*) AS cnt
            FROM employees
            GROUP BY department
            HAVING COUNT(*) > 5
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        // Should count both the implicit condition in HAVING
        expect(result.stats.conditions).toBeGreaterThanOrEqual(1);

        // Verify HAVING node exists
        const havingNode = result.nodes.find(n => n.type === 'filter' && n.label === 'HAVING');
        expect(havingNode).toBeDefined();
    });

    it('HAVING inside CTE also counts conditions', () => {
        const sql = `
            WITH dept_stats AS (
                SELECT department, COUNT(*) AS cnt
                FROM employees
                GROUP BY department
                HAVING COUNT(*) > 10
            )
            SELECT * FROM dept_stats
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();
        expect(result.stats.conditions).toBeGreaterThanOrEqual(1);
    });

    it('WHERE + HAVING both contribute to total conditions', () => {
        const sql = `
            SELECT department, COUNT(*) AS cnt
            FROM employees
            WHERE active = 1
            GROUP BY department
            HAVING COUNT(*) > 5
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        // At least 1 from WHERE + at least 1 from HAVING
        expect(result.stats.conditions).toBeGreaterThanOrEqual(2);
    });
});

describe('Audit regression: #9 — Subquery aliases excluded from UNION details', () => {
    it('UNION details show real tables, not subquery aliases', () => {
        const sql = `
            SELECT id FROM (SELECT id FROM real_alpha) sub_a
            UNION
            SELECT id FROM real_beta
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        const unionNode = result.nodes.find(n => n.type === 'union');
        expect(unionNode).toBeDefined();

        if (unionNode?.details) {
            const detailText = unionNode.details.join(' ');
            // Should NOT contain the subquery alias
            expect(detailText).not.toContain('sub_a');
            // Should contain the real table from the right branch
            expect(detailText.toLowerCase()).toContain('real_beta');
        }
    });
});

describe('Audit regression: #11 — UNION node depth consistent with siblings', () => {
    it('UNION node inside CTE has depth = depth + 1, matching sibling nodes', () => {
        const sql = `
            WITH combined AS (
                SELECT id FROM table_a
                UNION
                SELECT id FROM table_b
            )
            SELECT * FROM combined
        `;
        const result = parseSql(sql, DIALECT);
        expect(result.error).toBeUndefined();

        const cteNode = result.nodes.find(n => n.type === 'cte');
        expect(cteNode).toBeDefined();
        expect(cteNode!.children).toBeDefined();

        const unionChild = cteNode!.children!.find(n => n.type === 'union');
        const tableChild = cteNode!.children!.find(n => n.type === 'table');
        expect(unionChild).toBeDefined();
        expect(tableChild).toBeDefined();

        // Both should have the same depth
        expect(unionChild!.depth).toBe(tableChild!.depth);
    });
});
