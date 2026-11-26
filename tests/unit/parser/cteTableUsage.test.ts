import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types';

const CTE_SQL = `WITH recent AS (SELECT id FROM orders),
top_rows AS (SELECT r.id FROM recent r JOIN customers c ON r.id = c.id)
SELECT * FROM top_rows t JOIN recent x ON t.id = x.id`;

describe('Tables Used excludes CTE names', () => {
    it.each(['PostgreSQL', 'MySQL', 'Snowflake', 'BigQuery', 'TransactSQL'] as SqlDialect[])(
        'lists only physical tables in %s',
        dialect => {
            const result = parseSql(CTE_SQL, dialect);
            expect([...result.tableUsage.keys()].sort()).toEqual(['customers', 'orders']);
            expect(result.stats.tables).toBe(2);
        }
    );

    it('does not suggest a CTE for a CTE referenced twice', () => {
        const result = parseSql(CTE_SQL, 'PostgreSQL');
        expect(result.hints.some(hint => /Table 'recent' is (?:accessed|scanned)/.test(hint.message))).toBe(false);
    });

    it('still reports a physical table read in several CTEs', () => {
        const sql = `WITH a AS (SELECT id FROM orders), b AS (SELECT id FROM orders WHERE id > 1)
SELECT * FROM a JOIN b ON a.id = b.id`;
        const result = parseSql(sql, 'PostgreSQL');
        expect(result.tableUsage.get('orders')).toBe(2);
        expect(result.tableUsage.has('a')).toBe(false);
        expect(result.hints.some(hint => hint.message.includes("'orders'"))).toBe(true);
    });

    it('keeps the LIMIT hint for a query that reads only from CTEs', () => {
        const result = parseSql('WITH c AS (SELECT id FROM users) SELECT id FROM c', 'PostgreSQL');
        expect(result.hints.some(hint => hint.message === 'No LIMIT clause')).toBe(true);
    });

    it('counts a physical table that shares its name with the CTE reading it', () => {
        const result = parseSql('WITH orders AS (SELECT id FROM orders) SELECT id FROM orders', 'PostgreSQL');
        expect([...result.tableUsage.keys()]).toEqual(['orders']);
    });
});
