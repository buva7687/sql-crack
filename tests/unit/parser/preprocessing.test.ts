import { collapseSnowflakePaths, rewriteGroupingSets, preprocessOracleSyntax, preprocessSnowflakeSyntax, preprocessForParsing, hoistNestedCtes } from '../../../src/webview/sqlParser';

describe('parser preprocessing transforms', () => {
    describe('rewriteGroupingSets', () => {
        it('returns null when GROUPING SETS is absent', () => {
            const sql = 'SELECT dept, SUM(sales) FROM sales GROUP BY dept';
            expect(rewriteGroupingSets(sql)).toBeNull();
        });

        it('rewrites GROUPING SETS into a flat GROUP BY list', () => {
            const sql = 'SELECT dept, SUM(sales) FROM sales GROUP BY GROUPING SETS ((dept), (region))';
            const rewritten = rewriteGroupingSets(sql);

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/GROUPING\s+SETS/i);
            expect(rewritten).toContain('GROUP BY dept, region');
        });

        it('preserves existing GROUP BY columns and de-duplicates expanded columns', () => {
            const sql = 'SELECT dept, region, SUM(sales) FROM sales GROUP BY dept, region GROUPING SETS ((dept), (region), (dept, region)) HAVING SUM(sales) > 10';
            const rewritten = rewriteGroupingSets(sql);

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/GROUPING\s+SETS/i);
            expect(rewritten).toContain('GROUP BY dept, region HAVING');
        });

        it('handles single-column GROUPING SETS edge case', () => {
            const sql = 'SELECT x, COUNT(*) FROM t GROUP BY x GROUPING SETS ((x))';
            const rewritten = rewriteGroupingSets(sql);

            expect(rewritten).not.toBeNull();
            expect(rewritten).toContain('GROUP BY x');
            expect(rewritten).not.toMatch(/GROUPING\s+SETS/i);
        });

        it('handles empty grouping sets by removing an empty GROUP BY clause', () => {
            const sql = 'SELECT COUNT(*) FROM sales GROUP BY GROUPING SETS (())';
            const rewritten = rewriteGroupingSets(sql);

            expect(rewritten).not.toBeNull();
            expect(rewritten).toContain('SELECT COUNT(*) FROM sales');
            expect(rewritten).not.toMatch(/GROUPING\s+SETS/i);
            expect(rewritten).not.toMatch(/GROUP\s+BY\s*(HAVING|ORDER\s+BY|LIMIT|$)/i);
        });

        it('ignores GROUPING SETS text inside comments and string literals', () => {
            const sql = "-- GROUP BY GROUPING SETS ((dept))\nSELECT 'GROUPING SETS ((dept))' AS txt FROM sales";
            expect(rewriteGroupingSets(sql)).toBeNull();
        });
    });

    describe('collapseSnowflakePaths', () => {
        it('returns null for non-Snowflake dialects', () => {
            const sql = 'SELECT payload:a:b:c FROM events';
            expect(collapseSnowflakePaths(sql, 'PostgreSQL')).toBeNull();
        });

        it('returns null for paths with 2 or fewer segments', () => {
            const sql = 'SELECT payload:a:b FROM events';
            expect(collapseSnowflakePaths(sql, 'Snowflake')).toBeNull();
        });

        it('collapses 3+ segment Snowflake paths', () => {
            const sql = 'SELECT payload:a:b:c, data:x:y:z:w FROM events';
            const rewritten = collapseSnowflakePaths(sql, 'Snowflake');

            expect(rewritten).not.toBeNull();
            expect(rewritten).toContain('payload:a:b');
            expect(rewritten).toContain('data:x:y');
            expect(rewritten).not.toContain('payload:a:b:c');
            expect(rewritten).not.toContain('data:x:y:z:w');
        });

        it('preserves trailing :: casts while collapsing deep paths', () => {
            const sql = 'SELECT payload:a:b:c::string FROM events';
            const rewritten = collapseSnowflakePaths(sql, 'Snowflake');

            expect(rewritten).not.toBeNull();
            expect(rewritten).toContain('payload:a:b::string');
        });

        it('skips numeric prefixes and ignores colon patterns inside strings', () => {
            const sql = "SELECT '00:00:00' AS t, 12:34:56:78 AS maybe_time, payload:a:b:c::string FROM events";
            const rewritten = collapseSnowflakePaths(sql, 'Snowflake');

            expect(rewritten).not.toBeNull();
            expect(rewritten).toContain("'00:00:00'");
            expect(rewritten).toContain('12:34:56:78');
            expect(rewritten).toContain('payload:a:b::string');
        });
    });

    describe('preprocessOracleSyntax', () => {
        it('returns null for non-Oracle dialect', () => {
            const sql = 'SELECT * FROM a WHERE a.id = b.id(+)';
            expect(preprocessOracleSyntax(sql, 'MySQL')).toBeNull();
        });

        it('returns null when no Oracle-specific syntax present', () => {
            const sql = 'SELECT id, name FROM employees WHERE active = 1';
            expect(preprocessOracleSyntax(sql, 'Oracle')).toBeNull();
        });

        it('removes (+) outer join operator', () => {
            const sql = 'SELECT * FROM a, b WHERE a.id = b.id(+) AND a.type = b.type(+)';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toContain('(+)');
            expect(rewritten).toContain('a.id = b.id');
            expect(rewritten).toContain('a.type = b.type');
        });

        it('rewrites MINUS to EXCEPT', () => {
            const sql = 'SELECT id FROM employees MINUS SELECT id FROM contractors';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).toContain('EXCEPT');
            expect(rewritten).not.toMatch(/\bMINUS\b/);
        });

        it('handles multiple MINUS operators', () => {
            const sql = 'SELECT id FROM a MINUS SELECT id FROM b MINUS SELECT id FROM c';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            const exceptCount = (rewritten!.match(/\bEXCEPT\b/g) || []).length;
            expect(exceptCount).toBe(2);
            expect(rewritten).not.toMatch(/\bMINUS\b/);
        });

        it('does not rewrite MINUS inside string literals', () => {
            const sql = "SELECT 'MINUS' AS op FROM dual";
            expect(preprocessOracleSyntax(sql, 'Oracle')).toBeNull();
        });

        it('strips START WITH / CONNECT BY clauses', () => {
            const sql = 'SELECT employee_id FROM employees START WITH manager_id IS NULL CONNECT BY PRIOR employee_id = manager_id';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bSTART\s+WITH\b/i);
            expect(rewritten).not.toMatch(/\bCONNECT\s+BY\b/i);
            expect(rewritten).toContain('SELECT employee_id FROM employees');
        });

        it('strips ORDER SIBLINGS BY', () => {
            const sql = 'SELECT id FROM employees START WITH mgr IS NULL CONNECT BY PRIOR id = mgr ORDER SIBLINGS BY name';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bORDER\s+SIBLINGS\s+BY\b/i);
            expect(rewritten).not.toMatch(/\bSTART\s+WITH\b/i);
            expect(rewritten).not.toMatch(/\bCONNECT\s+BY\b/i);
        });

        it('strips CONNECT BY inside a CTE while preserving the CTE structure', () => {
            const sql = `WITH h AS (
                SELECT id, name FROM departments
                START WITH parent_id IS NULL
                CONNECT BY PRIOR id = parent_id
            )
            SELECT * FROM h`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bCONNECT\s+BY\b/i);
            expect(rewritten).toContain('WITH h AS');
            expect(rewritten).toContain('SELECT * FROM h');
        });
    });

    describe('preprocessOracleSyntax — PIVOT/UNPIVOT', () => {
        it('strips PIVOT clause', () => {
            const sql = `SELECT * FROM sales
                PIVOT (SUM(amount) FOR quarter IN ('Q1', 'Q2', 'Q3', 'Q4'))
                WHERE year = 2024`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bPIVOT\b/i);
            expect(rewritten).toContain('SELECT * FROM sales');
            expect(rewritten).toContain('WHERE year = 2024');
        });

        it('strips UNPIVOT clause', () => {
            const sql = `SELECT * FROM quarterly_sales
                UNPIVOT (amount FOR quarter IN (q1, q2, q3, q4))`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bUNPIVOT\b/i);
        });

        it('strips PIVOT with nested parentheses', () => {
            const sql = `SELECT * FROM (
                SELECT product, quarter, amount FROM sales
            )
            PIVOT (SUM(amount) FOR quarter IN (SELECT DISTINCT quarter FROM periods))`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bPIVOT\b/i);
        });

        it('strips PIVOT inside a nested subquery', () => {
            const sql = `SELECT * FROM (
                SELECT * FROM (SELECT dept, qtr, amt FROM sales)
                PIVOT (SUM(amt) FOR qtr IN ('Q1', 'Q2'))
            ) pivoted WHERE dept = 10`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bPIVOT\b/i);
            expect(rewritten).toContain('WHERE dept = 10');
        });

        it('handles (+) joins combined with PIVOT in same query', () => {
            const sql = `SELECT * FROM orders o, customers c
                WHERE o.cust_id = c.id(+)
                PIVOT (COUNT(*) FOR status IN ('open', 'closed'))`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toContain('(+)');
            expect(rewritten).not.toMatch(/\bPIVOT\b/i);
        });
    });

    describe('preprocessOracleSyntax — FLASHBACK (AS OF)', () => {
        it('strips AS OF SCN clause', () => {
            const sql = 'SELECT * FROM employees AS OF SCN 123456';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bAS\s+OF\s+SCN\b/i);
            expect(rewritten).toContain('SELECT * FROM employees');
        });

        it('strips AS OF TIMESTAMP clause', () => {
            const sql = "SELECT * FROM employees AS OF TIMESTAMP SYSTIMESTAMP - INTERVAL '1' HOUR WHERE dept_id = 10";
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bAS\s+OF\s+TIMESTAMP\b/i);
            expect(rewritten).toContain('WHERE dept_id = 10');
        });
    });

    describe('preprocessOracleSyntax — MODEL clause', () => {
        it('strips MODEL clause with DIMENSION BY, MEASURES, RULES', () => {
            const sql = `SELECT country, year, sales FROM sales_view
                MODEL
                DIMENSION BY (country, year)
                MEASURES (sales)
                RULES (sales[country = 'US', year = 2025] = sales[cv(country), year = 2024] * 1.1)`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bMODEL\b/i);
            expect(rewritten).toContain('SELECT country, year, sales FROM sales_view');
        });

        it('does not strip MODEL when it is a table/column name', () => {
            const sql = 'SELECT model FROM cars WHERE model = 1';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            // No MODEL sub-keywords follow, so it should not be stripped
            expect(rewritten).toBeNull();
        });

        it('strips MODEL clause with PARTITION BY', () => {
            const sql = `SELECT country, year, sales FROM sales_view
                MODEL
                PARTITION BY (region)
                DIMENSION BY (country, year)
                MEASURES (sales)
                RULES (sales['US', 2025] = 100)`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bMODEL\b/i);
            expect(rewritten).toContain('SELECT country, year, sales FROM sales_view');
        });
    });

    describe('preprocessOracleSyntax — RETURNING INTO', () => {
        it('strips INTO clause after RETURNING', () => {
            const sql = 'INSERT INTO employees (name) VALUES (\'John\') RETURNING id INTO :emp_id';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).not.toMatch(/\bINTO\s+:emp_id\b/);
            expect(rewritten).toMatch(/\bRETURNING\b/i);
        });

        it('strips INTO with multiple bind variables', () => {
            const sql = 'DELETE FROM employees WHERE id = 5 RETURNING name, salary INTO :n, :s';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            // Should keep RETURNING name, salary but strip INTO :n, :s
            expect(rewritten).toMatch(/\bRETURNING\b/i);
            expect(rewritten).toContain('name, salary');
        });

        it('does not cross statement boundaries', () => {
            const sql = 'UPDATE t SET x = 1 RETURNING id; INSERT INTO t2 (id) VALUES (1)';
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            // Should NOT strip the INSERT INTO — the RETURNING has no INTO in same statement
            if (rewritten !== null) {
                expect(rewritten).toContain('INSERT INTO t2');
            }
        });

        it('handles multi-line RETURNING INTO', () => {
            const sql = `UPDATE employees
                SET salary = salary * 1.1
                WHERE department_id = 10
                RETURNING employee_id, salary
                INTO :id, :sal`;
            const rewritten = preprocessOracleSyntax(sql, 'Oracle');

            expect(rewritten).not.toBeNull();
            expect(rewritten).toMatch(/\bRETURNING\b/i);
            expect(rewritten).toContain('employee_id, salary');
            expect(rewritten).not.toMatch(/INTO\s+:id/);
        });
    });

    describe('hoistNestedCtes — quoted CTE names', () => {
        it('hoists two nested ( WITH ... ) blocks with unquoted names', () => {
            const sql = `SELECT * FROM (WITH cte1 AS (SELECT 1 AS x) SELECT * FROM cte1) a JOIN (WITH cte2 AS (SELECT 2 AS y) SELECT * FROM cte2) b ON a.x = b.y`;
            const result = hoistNestedCtes(sql);

            expect(result).not.toBeNull();
            expect(result).toMatch(/^\s*WITH\b/i);
            expect(result).toContain('cte1');
            expect(result).toContain('cte2');
            // Both should be hoisted — no nested WITH remaining
            const masked = result!.replace(/'[^']*'/g, '');
            expect(masked).not.toMatch(/\(\s*WITH\b/i);
        });

        it('hoists two nested ( WITH ... ) blocks with quoted CTE names', () => {
            const sql = `SELECT * FROM (WITH "my_cte" AS (SELECT 1 AS x) SELECT * FROM "my_cte") a JOIN (WITH "other_cte" AS (SELECT 2 AS y) SELECT * FROM "other_cte") b ON a.x = b.y`;
            const result = hoistNestedCtes(sql);

            expect(result).not.toBeNull();
            expect(result).toMatch(/^\s*WITH\b/i);
            expect(result).toContain('"my_cte"');
            expect(result).toContain('"other_cte"');
        });

        it('merges nested ( WITH ... ) with existing top-level WITH when CTEs are quoted', () => {
            const sql = `WITH "top_cte" AS (SELECT 1 AS a) SELECT * FROM "top_cte" JOIN (WITH "nested_cte" AS (SELECT 2 AS b) SELECT * FROM "nested_cte") t ON "top_cte".a = t.b`;
            const result = hoistNestedCtes(sql);

            expect(result).not.toBeNull();
            expect(result).toContain('"top_cte"');
            expect(result).toContain('"nested_cte"');
            // Should have a single top-level WITH
            const withCount = (result!.match(/\bWITH\b/gi) || []).length;
            // One WITH at top level (the nested one is merged)
            expect(withCount).toBe(1);
        });
    });

    describe('preprocessSnowflakeSyntax', () => {
        it('returns null for non-Snowflake dialects', () => {
            const sql = 'SELECT IFF(x > 0, 1, 0) FROM t QUALIFY ROW_NUMBER() OVER (ORDER BY x) = 1';
            expect(preprocessSnowflakeSyntax(sql, 'PostgreSQL')).toBeNull();
        });

        it('returns null when no Snowflake syntax present', () => {
            const sql = 'SELECT id, name FROM employees WHERE active = 1';
            expect(preprocessSnowflakeSyntax(sql, 'Snowflake')).toBeNull();
        });

        it('strips QUALIFY clause', () => {
            const sql = 'SELECT id, name FROM employees QUALIFY ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) = 1';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).not.toMatch(/\bQUALIFY\b/i);
            expect(result).toContain('SELECT id, name FROM employees');
        });

        it('strips QUALIFY clause before ORDER BY', () => {
            const sql = 'SELECT * FROM t QUALIFY ROW_NUMBER() OVER (ORDER BY x) = 1 ORDER BY id';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).not.toMatch(/\bQUALIFY\b/i);
            expect(result).toContain('ORDER BY id');
        });

        it('rewrites IFF(cond, a, b) to CASE WHEN ... END', () => {
            const sql = 'SELECT IFF(x > 0, 1, 0) AS flag FROM t';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).not.toMatch(/\bIFF\s*\(/i);
            expect(result).toMatch(/CASE\s+WHEN\s+x > 0\s+THEN\s+1\s+ELSE\s+0\s+END/i);
        });

        it('rewrites nested IFF expressions', () => {
            const sql = 'SELECT IFF(a > 0, IFF(b > 0, 1, 2), 3) FROM t';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).not.toMatch(/\bIFF\s*\(/i);
            // Should have two CASE/END pairs
            const caseCount = (result!.match(/\bCASE\b/gi) || []).length;
            const endCount = (result!.match(/\bEND\b/gi) || []).length;
            expect(caseCount).toBe(2);
            expect(endCount).toBe(2);
        });

        it('removes trailing comma before FROM', () => {
            const sql = 'SELECT a, b, FROM t';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).toContain('SELECT a, b FROM t');
        });

        it('removes trailing comma before WHERE', () => {
            const sql = 'SELECT a, WHERE x = 1';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).toMatch(/SELECT a\s+WHERE/);
        });

        it('strips ::TYPE cast suffixes', () => {
            const sql = 'SELECT col::VARCHAR, num::INTEGER FROM t';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).not.toContain('::');
            expect(result).toContain('SELECT col, num FROM t');
        });

        it('strips ::TYPE with precision', () => {
            const sql = 'SELECT col::NUMBER(10,2) FROM t';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).not.toContain('::');
            expect(result).toContain('SELECT col FROM t');
        });

        it('handles IFF + QUALIFY in same query', () => {
            const sql = 'SELECT IFF(status = 1, \'active\', \'inactive\') AS label FROM users QUALIFY ROW_NUMBER() OVER (ORDER BY id) = 1';
            const result = preprocessSnowflakeSyntax(sql, 'Snowflake');

            expect(result).not.toBeNull();
            expect(result).not.toMatch(/\bIFF\s*\(/i);
            expect(result).not.toMatch(/\bQUALIFY\b/i);
            expect(result).toMatch(/\bCASE\b/i);
        });
    });

    describe('preprocessForParsing (unified)', () => {
        it('applies PostgreSQL preprocessing', () => {
            const sql = "SELECT created_at AT TIME ZONE 'UTC' FROM events";
            const result = preprocessForParsing(sql, 'PostgreSQL');

            expect(result).not.toMatch(/AT\s+TIME\s+ZONE/i);
            expect(result).toContain('SELECT created_at');
        });

        it('applies GROUPING SETS rewrite for any dialect', () => {
            const sql = 'SELECT dept, SUM(sales) FROM t GROUP BY GROUPING SETS ((dept), (region))';
            const result = preprocessForParsing(sql, 'MySQL');

            expect(result).not.toMatch(/GROUPING\s+SETS/i);
            expect(result).toContain('GROUP BY dept, region');
        });

        it('applies Oracle preprocessing', () => {
            const sql = 'SELECT * FROM a, b WHERE a.id = b.id(+)';
            const result = preprocessForParsing(sql, 'Oracle');

            expect(result).not.toContain('(+)');
        });

        it('applies Snowflake path collapse', () => {
            const sql = 'SELECT payload:a:b:c:d FROM events';
            const result = preprocessForParsing(sql, 'Snowflake');

            // Should collapse to 2 segments
            expect(result).toContain('payload:a:b');
            expect(result).not.toContain('payload:a:b:c:d');
        });

        it('applies CTE hoisting for any dialect', () => {
            const sql = 'SELECT * FROM (WITH cte AS (SELECT 1 AS x) SELECT * FROM cte) t';
            const result = preprocessForParsing(sql, 'Snowflake');

            // CTE should be hoisted to top level
            expect(result).toMatch(/^\s*WITH\s+cte\s+AS/i);
        });

        it('returns original SQL when no transforms apply', () => {
            const sql = 'SELECT id, name FROM employees WHERE active = 1';
            const result = preprocessForParsing(sql, 'MySQL');

            expect(result).toBe(sql);
        });
    });
});
