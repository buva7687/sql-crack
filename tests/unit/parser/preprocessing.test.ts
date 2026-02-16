import { collapseSnowflakePaths, rewriteGroupingSets } from '../../../src/webview/sqlParser';

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
});
