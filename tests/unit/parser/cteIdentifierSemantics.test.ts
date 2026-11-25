import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types';

describe('CTE identifier semantics', () => {
    it('keeps an unquoted physical relation separate from a quoted CTE', () => {
        const result = parseSql('WITH "Foo" AS (SELECT id FROM source_a) SELECT id FROM Foo', 'PostgreSQL', { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.nodes.find(node => node.type === 'table' && node.label === 'Foo')?.tableCategory).toBe('physical');
    });
    it('expands an unquoted CTE star regardless of qualifier case', () => {
        const result = parseSql('WITH c AS (SELECT a,b FROM src) SELECT C.* FROM c UNION ALL SELECT x,y FROM other', 'PostgreSQL', { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.columnLineage.map(column => column.outputColumn)).toEqual(['a', 'b']);
        expect(result.columnLineage[0].sources.some(source => source.table === 'other')).toBe(true);
    });
    it('does not report selected columns as dead for a quoted alias star', () => {
        const result = parseSql('WITH c AS (SELECT a,b FROM src) SELECT "t".* FROM c t', 'PostgreSQL', { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.hints.filter(hint => /dead column/.test(hint.message))).toEqual([]);
    });

    it.each(['PostgreSQL', 'Snowflake', 'Oracle', 'Redshift'] as SqlDialect[])('distinguishes quoted CTEs and physical relations in %s', dialect => {
        for (const sql of [
            'WITH "Foo" AS (SELECT id FROM src) SELECT id FROM Foo',
            'WITH Foo AS (SELECT id FROM src) SELECT id FROM "Foo"',
        ]) {
            const result = parseSql(sql, dialect, { allowDialectFallback: false });
            expect(result.partial).toBeUndefined();
            expect(result.error).toBeUndefined();
            expect(result.nodes.find(node => node.type === 'table' && node.label === 'Foo')?.tableCategory).toBe('physical');
        }
        const quoted = parseSql('WITH "Foo" AS (SELECT id FROM src) SELECT id FROM "Foo"', dialect, { allowDialectFallback: false });
        expect(quoted.nodes.find(node => node.type === 'table' && node.label === 'Foo')?.tableCategory).toBe('cte_reference');
        expect([...quoted.tableUsage.keys()]).toEqual(['src']);
    });

    it.each(['PostgreSQL', 'Snowflake', 'Oracle', 'Redshift', 'MySQL', 'TransactSQL'] as SqlDialect[])('expands case-varied stars in %s', dialect => {
        const result = parseSql('WITH c AS (SELECT a,b FROM src) SELECT T.* FROM c t UNION ALL SELECT x,y FROM other', dialect, { allowDialectFallback: false });
        expect(result.partial).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.columnLineage.map(column => column.outputColumn)).toEqual(['a', 'b']);
        expect(result.columnLineage[1].sources.some(source => source.table === 'other' && source.column === 'y')).toBe(true);
    });

    it('keeps different quoted alias identities separate', () => {
        const result = parseSql('WITH c AS (SELECT a FROM src_a), d AS (SELECT b FROM src_b) SELECT "T".* FROM c "T" JOIN d "t" ON "T".a="t".b UNION ALL SELECT x FROM other', 'PostgreSQL', { allowDialectFallback: false });
        expect(result.partial).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.columnLineage.map(column => column.outputColumn)).toEqual(['a']);
        expect(result.columnLineage[0].sources.map(source => source.table)).toEqual(['c', 'other']);
    });

    it('preserves bindings through nested query scopes, comments and literals', () => {
        const result = parseSql('WITH "Foo" AS (SELECT id FROM src), c AS (SELECT id FROM "Foo") SELECT c.id FROM c WHERE EXISTS (SELECT 1 FROM Foo WHERE note = \'FROM "Foo"\') /* JOIN "Foo" */', 'PostgreSQL', { allowDialectFallback: false });
        const nested = result.nodes.flatMap(node => node.children ?? []);
        expect(nested.find(node => node.type === 'table' && node.label === 'Foo')?.tableCategory).toBe('cte_reference');
        expect(result.tableUsage.has('foo')).toBe(true);
    });

    it.each(['"t"', '"T"'])('recognizes a delimited alias star %s without dead-column advice', alias => {
        const result = parseSql(`WITH c AS (SELECT a,b FROM src) SELECT ${alias}.* FROM c ${alias}`, 'PostgreSQL', { allowDialectFallback: false });
        expect(result.hints.some(hint => /dead column/.test(hint.message))).toBe(false);
    });

    it('does not mistake literal or comment stars for column usage', () => {
        const result = parseSql('WITH c AS (SELECT a,b FROM src) SELECT t.a, \'"t".*\' AS note FROM c t /* "t".* */', 'PostgreSQL', { allowDialectFallback: false });
        expect(result.hints.some(hint => /dead column.*b/.test(hint.message))).toBe(true);
    });

    it('keeps quoted CTE bindings when JOIN predicates use keyword-like qualified columns', () => {
        const sql = `
            WITH "Orders" AS (SELECT id, src.offset FROM src)
            SELECT b.id
            FROM "Orders" b
            JOIN mid m ON b.offset = m.offset
            JOIN last_table z ON m.id = z.id
        `;
        const result = parseSql(sql, 'PostgreSQL', { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.nodes.find(node => node.type === 'table' && node.label === 'Orders')?.tableCategory).toBe('cte_reference');
        expect([...result.tableUsage.keys()]).toEqual(['src', 'mid', 'last_table']);
    });

    it('does not shift query scopes on dot-qualified or sigil-prefixed select identifiers', () => {
        const qualifiedSelect = `
            WITH "Orders" AS (SELECT id, src.select FROM src)
            SELECT "O".id
            FROM "Orders" "O"
            JOIN mid m ON "O".limit = m.offset
            JOIN last_table z ON m.id = z.id
        `;
        const pgResult = parseSql(qualifiedSelect, 'PostgreSQL', { allowDialectFallback: false });
        expect(pgResult.error).toBeUndefined();
        expect(pgResult.nodes.find(node => node.type === 'table' && node.label === 'Orders')?.tableCategory).toBe('cte_reference');
        expect(pgResult.columnLineage[0].sources.map(source => source.table)).toEqual(['Orders']);

        const sfResult = parseSql('SELECT $select FROM tbl_a CROSS JOIN tbl_b', 'Snowflake', { allowDialectFallback: false });
        expect(sfResult.error).toBeUndefined();
        expect(sfResult.nodes.filter(node => node.type === 'join').map(node => node.label)).toEqual(['CROSS JOIN']);
        expect(sfResult.nodes.find(node => node.type === 'table' && node.label === 'tbl_a')?.alias).toBeUndefined();

        const leadingDecimal = parseSql('SELECT .5 FROM "Orders"', 'PostgreSQL', { allowDialectFallback: false });
        expect(leadingDecimal.error).toBeUndefined();
        expect(leadingDecimal.nodes.find(node => node.type === 'table')?.label).toBe('Orders');
    });
});
