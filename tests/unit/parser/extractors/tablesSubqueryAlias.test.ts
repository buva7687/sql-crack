/**
 * Regression test for Observation #9:
 * extractTablesFromStatement should skip subquery aliases.
 *
 * A FROM item like `(SELECT ... FROM real_table) sub` has `expr.ast` set,
 * and getTableName would return the alias "sub". This test ensures those
 * are filtered out.
 */

import { extractTablesFromStatement } from '../../../../src/webview/parser/extractors/tables';

describe('Audit regression: #9 — extractTablesFromStatement skips subquery aliases', () => {
    it('excludes subquery alias, keeps real tables', () => {
        const stmt = {
            from: [
                { expr: { ast: { type: 'select' } }, as: 'sub_alias' },
                { table: 'real_table' },
            ]
        };

        const tables = extractTablesFromStatement(stmt);
        expect(tables).toEqual(['real_table']);
        expect(tables).not.toContain('sub_alias');
    });

    it('returns empty when all FROM items are subqueries', () => {
        const stmt = {
            from: [
                { expr: { ast: { type: 'select' } }, as: 'a' },
                { expr: { ast: { type: 'select' } }, as: 'b' },
            ]
        };

        const tables = extractTablesFromStatement(stmt);
        expect(tables).toEqual([]);
    });

    it('still extracts real tables alongside subqueries and joins', () => {
        const stmt = {
            from: [
                { table: 'orders' },
                { expr: { ast: { type: 'select' } }, as: 'sub' },
                { table: 'products', join: 'LEFT JOIN' },
            ]
        };

        const tables = extractTablesFromStatement(stmt);
        expect(tables).toContain('orders');
        expect(tables).toContain('products');
        expect(tables).not.toContain('sub');
    });
});
