import { Parser } from 'node-sql-parser';
import { parseSql } from '../../../../src/webview/sqlParser';
import { extractConditions } from '../../../../src/webview/parser/extractors/conditions';

describe('Cartesian hints and WHERE conditions', () => {
    const hasCartesianHint = (sql: string): boolean =>
        parseSql(sql, 'MySQL').hints.some(hint => hint.message === 'Possible Cartesian product');

    it('does not mistake independent sources for a Cartesian product', () => {
        for (const sql of [
            'SELECT id FROM a UNION ALL SELECT id FROM b',
            'INSERT INTO archive SELECT id FROM orders',
            'SELECT (SELECT MAX(id) FROM b) AS x FROM a',
        ]) {
            expect(hasCartesianHint(sql)).toBe(false);
        }
    });

    it('still warns for two unconnected tables in one FROM list', () => {
        expect(hasCartesianHint('SELECT * FROM a, b')).toBe(true);
        expect(hasCartesianHint('SELECT * FROM a JOIN b ON a.id = b.id, c')).toBe(true);
    });

    it('counts EXISTS, NOT EXISTS, and boolean WHERE expressions', () => {
        const cases = [
            ['SELECT * FROM a WHERE EXISTS (SELECT 1 FROM b)', 'EXISTS (subquery)'],
            ['SELECT * FROM a WHERE NOT EXISTS (SELECT 1 FROM b)', 'NOT EXISTS (subquery)'],
            ['SELECT * FROM a WHERE is_active', 'is_active'],
        ];
        const parser = new Parser();
        for (const [sql, label] of cases) {
            const result = parseSql(sql, 'MySQL');
            expect(result.stats.conditions).toBeGreaterThan(0);
            const ast = parser.astify(sql, { database: 'MySQL' });
            expect(extractConditions((ast as any).where)).toEqual([label]);
        }
    });
});
