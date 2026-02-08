/**
 * Edge Cases Tests
 *
 * Tests for complex and unusual SQL scenarios:
 * - Deeply nested CTEs (10+ levels)
 * - Complex queries with 20+ JOINs
 * - Unicode/special characters in identifiers
 * - Comments in various positions
 * - Very large queries
 */

import { parseSql, parseSqlBatch, validateSql } from '../../../src/webview/sqlParser';

describe('Edge Cases', () => {
    describe('Deeply Nested CTEs', () => {
        it('parses 5-level nested CTE', () => {
            const sql = `
                WITH cte1 AS (SELECT id FROM table1),
                     cte2 AS (SELECT id FROM cte1),
                     cte3 AS (SELECT id FROM cte2),
                     cte4 AS (SELECT id FROM cte3),
                     cte5 AS (SELECT id FROM cte4)
                SELECT * FROM cte5
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('parses 10-level nested CTE chain', () => {
            const ctes = Array.from({ length: 10 }, (_, i) => {
                const prev = i === 0 ? 'base_table' : `cte${i}`;
                return `cte${i + 1} AS (SELECT id, name FROM ${prev})`;
            }).join(',\n');

            const sql = `WITH ${ctes} SELECT * FROM cte10`;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses recursive CTE with multiple references', () => {
            const sql = `
                WITH RECURSIVE org_tree AS (
                    SELECT id, name, manager_id, 1 AS level
                    FROM employees
                    WHERE manager_id IS NULL
                    UNION ALL
                    SELECT e.id, e.name, e.manager_id, t.level + 1
                    FROM employees e
                    JOIN org_tree t ON e.manager_id = t.id
                    WHERE t.level < 10
                )
                SELECT * FROM org_tree
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses CTEs with aggregations at each level', () => {
            const sql = `
                WITH
                    level1 AS (SELECT dept_id, COUNT(*) AS cnt FROM employees GROUP BY dept_id),
                    level2 AS (SELECT dept_id, cnt, SUM(cnt) OVER() AS total FROM level1),
                    level3 AS (SELECT dept_id, cnt, total, cnt * 100.0 / total AS pct FROM level2)
                SELECT * FROM level3 ORDER BY pct DESC
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });
    });

    describe('Complex JOINs (20+)', () => {
        it('parses query with 10 JOINs', () => {
            const tables = Array.from({ length: 10 }, (_, i) => `t${i + 1}`);
            const joins = tables.slice(1).map((t, i) =>
                `JOIN ${t} ON ${t}.id = t${i + 1}.${t}_id`
            ).join('\n');

            const sql = `SELECT * FROM t1 ${joins}`;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
            // Check that we have multiple table nodes
            const tableNodes = result.nodes.filter(n => n.type === 'table');
            expect(tableNodes.length).toBeGreaterThanOrEqual(5);
        });

        it('parses query with 20 JOINs', () => {
            const tables = Array.from({ length: 20 }, (_, i) => `table${i + 1}`);
            const joins = tables.slice(1).map((t, i) =>
                `LEFT JOIN ${t} ON ${t}.ref_id = table${i + 1}.id`
            ).join('\n');

            const sql = `SELECT table1.id FROM table1 ${joins}`;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses mixed JOIN types', () => {
            const sql = `
                SELECT *
                FROM orders o
                INNER JOIN customers c ON o.customer_id = c.id
                LEFT JOIN addresses a ON c.address_id = a.id
                RIGHT JOIN regions r ON a.region_id = r.id
                FULL OUTER JOIN countries co ON r.country_id = co.id
                CROSS JOIN currencies cu
                LEFT JOIN payments p ON o.id = p.order_id
                INNER JOIN payment_methods pm ON p.method_id = pm.id
                LEFT JOIN discounts d ON o.discount_id = d.id
                LEFT JOIN coupons cp ON o.coupon_id = cp.id
                INNER JOIN products pr ON o.product_id = pr.id
            `;

            const result = parseSql(sql, 'PostgreSQL');

            expect(result.error).toBeUndefined();
        });

        it('parses self-joins', () => {
            const sql = `
                SELECT
                    e1.name AS employee,
                    e2.name AS manager,
                    e3.name AS director,
                    e4.name AS vp,
                    e5.name AS ceo
                FROM employees e1
                LEFT JOIN employees e2 ON e1.manager_id = e2.id
                LEFT JOIN employees e3 ON e2.manager_id = e3.id
                LEFT JOIN employees e4 ON e3.manager_id = e4.id
                LEFT JOIN employees e5 ON e4.manager_id = e5.id
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });
    });

    describe('Unicode and Special Characters', () => {
        it('parses table names with unicode characters', () => {
            const sql = 'SELECT * FROM użytkownicy';

            const result = parseSql(sql, 'MySQL');

            // Parser may or may not support unicode - check it doesn't crash
            expect(result).toBeDefined();
        });

        it('parses column aliases with unicode', () => {
            const sql = 'SELECT name AS 名前, email AS メール FROM users';

            const result = parseSql(sql, 'MySQL');

            expect(result).toBeDefined();
        });

        it('parses string literals with unicode', () => {
            const sql = "SELECT * FROM users WHERE name = 'José García'";

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses emojis in string literals', () => {
            const sql = "SELECT * FROM posts WHERE content LIKE '%🎉%'";

            const result = parseSql(sql, 'MySQL');

            expect(result).toBeDefined();
        });

        it('handles backtick-quoted identifiers with spaces', () => {
            const sql = 'SELECT `user name`, `order total` FROM `my table`';

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('handles square bracket identifiers (SQL Server)', () => {
            const sql = 'SELECT [User Name], [Order Total] FROM [My Table]';

            const result = parseSql(sql, 'TransactSQL');

            expect(result.error).toBeUndefined();
        });

        it('handles double-quoted identifiers (PostgreSQL)', () => {
            const sql = 'SELECT "User Name", "Order Total" FROM "My Table"';

            const result = parseSql(sql, 'PostgreSQL');

            expect(result.error).toBeUndefined();
        });

        it('handles identifiers starting with underscore', () => {
            const sql = 'SELECT _id, _name FROM _users WHERE _active = 1';

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('handles identifiers with numbers', () => {
            const sql = 'SELECT col1, col2a, table2.col3 FROM table1 JOIN table2 ON table1.id2 = table2.id2';

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });
    });

    describe('Comments in SQL', () => {
        it('parses SQL with single-line comments', () => {
            const sql = `
                -- This is a comment
                SELECT id, -- inline comment
                       name
                FROM users -- table comment
                WHERE active = 1
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses SQL with block comments', () => {
            const sql = `
                /* Multi-line
                   comment */
                SELECT /* inline */ id, name
                FROM users
                /* WHERE clause */
                WHERE active = 1
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses SQL with nested-style comments', () => {
            const sql = `
                SELECT id FROM users
                /* outer comment /* not nested in MySQL */ still outer */
                WHERE id = 1
            `;

            const result = parseSql(sql, 'MySQL');

            // MySQL doesn't support nested comments, so this tests the parser's behavior
            expect(result).toBeDefined();
        });

        it('parses comment-only sections between statements', () => {
            const sql = `
                SELECT 1;
                -- Comment between statements
                /* Another comment */
                SELECT 2;
            `;

            const result = parseSqlBatch(sql, 'MySQL');

            expect(result.queries.length).toBeGreaterThanOrEqual(2);
        });

        it('handles comments inside string literals (should not be parsed as comments)', () => {
            const sql = "SELECT '-- not a comment' AS val FROM dual";

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });
    });

    describe('Very Large Queries', () => {
        it('handles query with many columns (100+)', () => {
            const columns = Array.from({ length: 100 }, (_, i) => `col${i + 1}`).join(', ');
            const sql = `SELECT ${columns} FROM big_table`;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('handles long WHERE clause with many conditions', () => {
            const conditions = Array.from({ length: 50 }, (_, i) =>
                `col${i + 1} = ${i + 1}`
            ).join(' AND ');
            const sql = `SELECT * FROM table1 WHERE ${conditions}`;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('handles large IN clause', () => {
            const values = Array.from({ length: 1000 }, (_, i) => i + 1).join(', ');
            const sql = `SELECT * FROM users WHERE id IN (${values})`;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('validates size limit for very large SQL', () => {
            const largeSql = 'SELECT ' + 'x'.repeat(200 * 1024); // 200KB

            const validation = validateSql(largeSql, {
                maxSqlSizeBytes: 100 * 1024, // 100KB limit
                maxQueryCount: 50
            });

            expect(validation).not.toBeNull();
            expect(validation?.type).toBe('size_limit');
        });

        it('handles batch with many statements', () => {
            const statements = Array.from({ length: 30 }, (_, i) =>
                `SELECT ${i + 1} AS num`
            ).join(';\n');

            const result = parseSqlBatch(statements, 'MySQL');

            expect(result.queries.length).toBe(30);
        });
    });

    describe('Malformed SQL Recovery', () => {
        it('handles missing FROM clause gracefully', () => {
            const sql = 'SELECT id, name WHERE active = 1';

            const result = parseSql(sql, 'MySQL');

            // Should either parse or return error, not crash
            expect(result).toBeDefined();
        });

        it('handles unclosed parenthesis', () => {
            const sql = 'SELECT * FROM users WHERE id IN (1, 2, 3';

            const result = parseSql(sql, 'MySQL');

            expect(result).toBeDefined();
            // Fallback parser produces partial result
            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0); // Should still extract 'users' table
        });

        it('handles unclosed string literal', () => {
            const sql = "SELECT * FROM users WHERE name = 'incomplete";

            const result = parseSql(sql, 'MySQL');

            expect(result).toBeDefined();
        });

        it('handles duplicate keywords', () => {
            const sql = 'SELECT SELECT * FROM users';

            const result = parseSql(sql, 'MySQL');

            expect(result).toBeDefined();
            // Fallback parser produces partial result
            expect(result.partial).toBe(true);
        });

        it('handles empty subquery', () => {
            const sql = 'SELECT * FROM ()';

            const result = parseSql(sql, 'MySQL');

            expect(result).toBeDefined();
        });

        it('batch handles mix of valid and invalid statements', () => {
            const sql = `
                SELECT 1;
                SELCT invalid;
                SELECT 2;
                FROM nowhere;
                SELECT 3;
            `;

            const result = parseSqlBatch(sql, 'MySQL');

            // With fallback parser, all statements produce results (some partial)
            expect(result.queries.length).toBeGreaterThan(0);
            // Valid queries should succeed
            const hasNonPartial = result.queries.some(q => !q.partial && !q.error);
            expect(hasNonPartial).toBe(true);
        });
    });

    describe('Complex Expressions', () => {
        it('parses deeply nested CASE expressions', () => {
            const sql = `
                SELECT
                    CASE
                        WHEN a = 1 THEN
                            CASE
                                WHEN b = 1 THEN 'a1b1'
                                WHEN b = 2 THEN 'a1b2'
                                ELSE 'a1other'
                            END
                        WHEN a = 2 THEN
                            CASE
                                WHEN c = 1 THEN 'a2c1'
                                ELSE 'a2other'
                            END
                        ELSE 'other'
                    END AS result
                FROM table1
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses complex arithmetic expressions', () => {
            const sql = `
                SELECT
                    ((a + b) * (c - d)) / (e + 1) AS calc1,
                    POWER(x, 2) + SQRT(y) - ABS(z) AS calc2,
                    (price * quantity) * (1 - discount / 100) AS total
                FROM calculations
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses multiple window functions', () => {
            const sql = `
                SELECT
                    id,
                    ROW_NUMBER() OVER (ORDER BY id) AS rn,
                    RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS dept_rank,
                    DENSE_RANK() OVER (ORDER BY salary DESC) AS overall_rank,
                    LAG(salary, 1) OVER (ORDER BY hire_date) AS prev_salary,
                    LEAD(salary, 1) OVER (ORDER BY hire_date) AS next_salary,
                    SUM(salary) OVER (PARTITION BY dept) AS dept_total,
                    AVG(salary) OVER () AS overall_avg
                FROM employees
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });

        it('parses subquery in SELECT clause', () => {
            const sql = `
                SELECT
                    u.id,
                    u.name,
                    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
                    (SELECT MAX(amount) FROM orders o WHERE o.user_id = u.id) AS max_order
                FROM users u
            `;

            const result = parseSql(sql, 'MySQL');

            expect(result.error).toBeUndefined();
        });
    });
});
