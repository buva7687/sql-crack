import { parseSql, parseSqlBatch } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types';

function parseStrict(sql: string, dialect: SqlDialect = 'PostgreSQL') {
    const result = parseSql(sql, dialect, { allowDialectFallback: false });
    expect(result.error).toBeUndefined();
    expect(result.partial).toBeUndefined();
    return result;
}

describe('release parser regression contracts', () => {
    it.each(['PostgreSQL', 'MySQL', 'Snowflake', 'SQLite', 'TransactSQL', 'Oracle', 'Redshift', 'Trino'] as const)(
        'maps declared CTE output names and both UNION sources by ordinal in %s', dialect => {
        const result = parseStrict(
            'WITH c(x,y) AS (SELECT a,b FROM src) SELECT c.* FROM c UNION ALL SELECT p,q FROM other',
            dialect
        );
        const c = result.nodes.find(node => node.type === 'table' && node.label === 'c')!;
        const other = result.nodes.find(node => node.type === 'table' && node.label === 'other')!;
        expect(result.columnLineage).toEqual([
            { outputColumn: 'x', sources: [
                { table: 'c', column: 'x', nodeId: c.id },
                { table: 'other', column: 'p', nodeId: other.id },
            ] },
            { outputColumn: 'y', sources: [
                { table: 'c', column: 'y', nodeId: c.id },
                { table: 'other', column: 'q', nodeId: other.id },
            ] },
        ]);
        expect(result.hints.some(hint => hint.message.includes('different column counts'))).toBe(false);
    });

    it.each(['BigQuery', 'Snowflake'] as const)('keeps renamed outputs used by a qualified exclusion star and UNION in %s', dialect => {
        const modifier = dialect === 'BigQuery' ? 'EXCEPT' : 'EXCLUDE';
        const result = parseStrict(
            `WITH c AS (SELECT secret AS retained, x AS secret, z AS also_used FROM src)
             SELECT c.* ${modifier} (secret) FROM c UNION ALL SELECT p,q FROM other`, dialect
        );
        expect(result.columnLineage.map(column => [column.outputColumn, column.sources.map(source => [source.table, source.column])])).toEqual([
            ['retained', [['c', 'retained'], ['other', 'p']]],
            ['also_used', [['c', 'also_used'], ['other', 'q']]],
        ]);
        expect(result.columnLineage.flatMap(column => column.sources).every(source => source.nodeId !== '')).toBe(true);
        expect(result.hints.filter(hint => hint.message.includes('dead column')).map(hint => hint.message)).toEqual([
            '1 dead column detected: secret',
        ]);
        expect(result.hints.some(hint => hint.message.includes('different column counts'))).toBe(false);
    });

    it('keeps case-distinct declared names through a CTE chain, exclusion and UNION', () => {
        const result = parseStrict(
            `WITH c("Mixed","MIXED") AS (SELECT a,b FROM src), d AS (SELECT c.* FROM c)
             SELECT d.* EXCLUDE ("Mixed") FROM d UNION ALL SELECT p FROM other`, 'Snowflake'
        );
        expect(result.columnLineage.map(column => [column.outputColumn, column.sources.map(source => [source.table, source.column])])).toEqual([
            ['MIXED', [['d', 'MIXED'], ['other', 'p']]],
        ]);
        expect(result.hints.some(hint => hint.message.includes('different column counts'))).toBe(false);
    });

    it('preserves spaces and dots inside excluded quoted output names', () => {
        const result = parseStrict(
            `WITH c AS (SELECT a AS "Order.Total", b AS "Order Total", z AS "ORDER" FROM src),
                  d AS (SELECT c.* FROM c)
             SELECT d.* EXCLUDE ("Order.Total", "Order Total") FROM d`, 'Snowflake'
        );
        expect(result.columnLineage.map(column => column.outputColumn)).toEqual(['ORDER']);
        expect(result.columnLineage[0].sources).toEqual([
            expect.objectContaining({ table: 'd', column: 'ORDER' }),
        ]);
    });

    it('does not reuse projection quoting between successive parses', () => {
        const quoted = 'WITH c AS (SELECT a AS "Mixed", b AS "OTHER" FROM src) SELECT * EXCLUDE ("Mixed") FROM c';
        const unquoted = quoted.replace('AS "Mixed"', 'AS Mixed').replace('EXCLUDE ("Mixed")', 'EXCLUDE (mixed)');
        for (const [sql, expected] of [
            [quoted, ['OTHER']],
            [unquoted, ['OTHER']],
            [quoted, ['OTHER']],
        ] as const) {
            expect(parseStrict(sql, 'Snowflake').columnLineage.map(column => column.outputColumn)).toEqual(expected);
        }
    });

    it('keeps declared names and exclusions separate across batch statements', () => {
        const result = parseSqlBatch(
            `WITH c("Mixed","OTHER") AS (SELECT a,b FROM src) SELECT * EXCLUDE ("Mixed") FROM c;
             WITH c(x,y) AS (SELECT a,b FROM src) SELECT c.* FROM c;`,
            'Snowflake', undefined, { allowDialectFallback: false }
        );
        expect(result.queries).toHaveLength(2);
        expect(result.queries.map(query => query.error)).toEqual([undefined, undefined]);
        expect(result.queries.map(query => query.partial)).toEqual([undefined, undefined]);
        expect(result.queries.map(query => query.columnLineage.map(column => column.outputColumn))).toEqual([
            ['OTHER'], ['x', 'y'],
        ]);
    });

    it.each(['offset', 'order', 'window'])('preserves source identities around .%s members and misleading SQL comments', member => {
        const result = parseStrict(
            `WITH "Orders" AS (SELECT id, src.${member} FROM src)
             SELECT "O".id FROM "Orders" "O"
             JOIN mid m ON "O".${member} = m.${member} /* SELECT FROM fake */
             JOIN last_table z ON m.id = z.id`
        );
        const cte = result.nodes.find(node => node.type === 'table' && node.label === 'Orders')!;
        expect(cte.tableCategory).toBe('cte_reference');
        expect([...result.tableUsage.keys()]).toEqual(['src', 'mid', 'last_table']);
        expect(result.nodes.filter(node => node.type === 'join')).toHaveLength(2);
        expect(result.columnLineage[0].sources).toEqual([{ table: 'Orders', column: 'id', nodeId: cte.id }]);
    });

    it('preserves lineage when a comment separates a qualifier from its dot', () => {
        const result = parseStrict('SELECT t /* note */ .id FROM src t');
        expect(result.columnLineage[0].sources).toEqual([
            { table: 'src', column: 'id', nodeId: result.nodes.find(node => node.type === 'table')!.id },
        ]);
    });

    it.todo('supports whitespace after the qualifier dot instead of the parser grammar falling back');

    it.each([
        ['PostgreSQL', 'archive'], ['TransactSQL', 'archive'], ['TransactSQL', '[archive]'],
    ] as const)('locates same-named %s SELECT INTO reads and writes independently (%s)', (dialect, name) => {
        const result = parseStrict(`SELECT id\nINTO ${name}\nFROM ${name};`, dialect);
        const tables = result.nodes.filter(node => node.type === 'table');
        expect(tables).toHaveLength(2);
        expect(tables.find(node => node.accessMode === 'write')).toMatchObject({ label: 'archive', startLine: 2 });
        expect(tables.find(node => node.accessMode !== 'write')).toMatchObject({ label: 'archive', startLine: 3 });
        expect(new Set(tables.map(node => node.id)).size).toBe(2);
    });
});
