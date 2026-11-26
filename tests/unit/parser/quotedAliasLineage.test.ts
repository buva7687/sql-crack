import { parseSql } from '../../../src/webview/sqlParser';

const dialects = ['PostgreSQL', 'Redshift', 'Snowflake', 'Oracle'] as const;

describe('quoted qualifier lineage', () => {
    it.each(dialects)('resolves a mixed-case quoted alias in %s', dialect => {
        const result = parseSql('SELECT "MyAlias".id FROM a "MyAlias"', dialect, { allowDialectFallback: false });
        const table = result.nodes.find(node => node.type === 'table' && node.label === 'a')!;
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.columnLineage[0].sources).toEqual([{ table: 'a', column: 'id', nodeId: table.id }]);
    });

    it.each(dialects)('keeps quoted and folded references on separate self-join instances in %s', dialect => {
        const quoted = dialect === 'Oracle' || dialect === 'Snowflake' ? 't' : 'T';
        const alias = quoted === 'T' ? 't' : 'T';
        const sql = `SELECT "${quoted}".id + ${quoted}.id AS combined FROM a "${quoted}" JOIN a ${alias} ON "${quoted}".id = ${alias}.id`;
        const result = parseSql(sql, dialect, { allowDialectFallback: false });
        const tables = result.nodes.filter(node => node.type === 'table');
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.columnLineage[0].sources).toEqual([
            { table: 'a', column: 'id', nodeId: tables.find(node => node.alias === quoted)!.id },
            { table: 'a', column: 'id', nodeId: tables.find(node => node.alias === alias)!.id },
        ]);
        expect(new Set(result.columnLineage[0].sources.map(source => source.nodeId)).size).toBe(2);
    });

    it.each(dialects)('preserves qualifiers inside function arguments in %s', dialect => {
        const result = parseSql('SELECT COALESCE("MyAlias".id, "MyAlias".fallback_id) AS id FROM a "MyAlias"', dialect, { allowDialectFallback: false });
        const table = result.nodes.find(node => node.type === 'table')!;
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.columnLineage[0].sources).toEqual([
            { table: 'a', column: 'id', nodeId: table.id },
            { table: 'a', column: 'fallback_id', nodeId: table.id },
        ]);
    });

    it.each(dialects)('keeps UNION scopes separate despite literal and comment qualifiers in %s', dialect => {
        const result = parseSql(`SELECT "MyAlias".id, '"MyAlias".id' AS note FROM a "MyAlias"
            /* "MyAlias".id */ UNION ALL SELECT "MyAlias".other_id, 'note' FROM b "MyAlias"`, dialect, { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.columnLineage[0].sources.map(source => [source.table, source.column, source.nodeId])).toEqual([
            ['a', 'id', result.nodes.find(node => node.type === 'table' && node.label === 'a')!.id],
            ['b', 'other_id', result.nodes.find(node => node.type === 'table' && node.label === 'b')!.id],
        ]);
    });

    it.each(dialects)('resolves a quoted physical table without an alias in %s', dialect => {
        const result = parseSql('SELECT "MyTable".id FROM "MyTable"', dialect, { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.columnLineage[0].sources).toEqual([
            { table: 'MyTable', column: 'id', nodeId: result.nodes.find(node => node.type === 'table')!.id },
        ]);
    });

    it.each(dialects)('keeps a scalar subquery qualifier separate from the outer projection in %s', dialect => {
        const result = parseSql(`SELECT (SELECT "MyAlias".id FROM b "MyAlias") AS nested_id,
            "MyAlias".id FROM a "MyAlias"`, dialect, { allowDialectFallback: false });
        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.columnLineage[1].sources).toEqual([
            { table: 'a', column: 'id', nodeId: result.nodes.find(node => node.type === 'table' && node.label === 'a')!.id },
        ]);
    });

    it.each(dialects)('still folds unquoted aliases in %s', dialect => {
        const result = parseSql('SELECT MYALIAS.id FROM a myalias', dialect, { allowDialectFallback: false });
        expect(result.columnLineage[0].sources).toEqual([
            { table: 'a', column: 'id', nodeId: result.nodes.find(node => node.type === 'table')!.id },
        ]);
    });

    it('does not reuse qualifier metadata between parses', () => {
        const sql = 'SELECT "MyAlias".id FROM a "MyAlias"';
        parseSql(sql, 'PostgreSQL');
        const result = parseSql(sql.replace('FROM a', 'FROM b'), 'PostgreSQL');
        expect(result.columnLineage[0].sources[0].table).toBe('b');
    });
});
