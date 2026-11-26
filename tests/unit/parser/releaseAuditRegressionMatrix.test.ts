/**
 * Broader regression matrix for the bug classes found in the 1.0.2 release
 * audit. Each block varies the SQL shape beyond the original reproduction and,
 * where both panels implement the behaviour, checks SQL Flow and Workspace
 * agree. Several original bugs were fixed in one panel while the other kept
 * the old logic, so parity is asserted explicitly.
 */
import { parseSql, parseSqlBatch } from '../../../src/webview/sqlParser';
import { ReferenceExtractor, SchemaExtractor } from '../../../src/workspace/extraction';
import type { SqlDialect } from '../../../src/webview/types';

const flow = (sql: string, dialect: SqlDialect) => parseSql(sql, dialect, { allowDialectFallback: false });
const workspaceTables = (sql: string, dialect: SqlDialect): string[] => {
    const result = new ReferenceExtractor().extractReferencesWithStatus(sql, '/audit.sql', dialect);
    expect(result.warnings).toEqual([]);
    return [...new Set(result.references.map(reference => reference.tableName))];
};

// Dialects whose grammar parses WITH RECURSIVE. BigQuery's does not, and falls
// back to a partial result.
const RECURSIVE_DIALECTS: SqlDialect[] = [
    'MySQL', 'MariaDB', 'PostgreSQL', 'Trino', 'Athena', 'Redshift', 'Snowflake', 'SQLite', 'Hive', 'Teradata',
];

describe('recursive CTE self-references (SQL Flow and Workspace parity)', () => {
    const shapes: Array<[string, string]> = [
        ['second CTE', `
            WITH RECURSIVE
                seed(id) AS (SELECT id FROM src),
                tree(id) AS (SELECT id FROM seed UNION ALL SELECT id FROM tree)
            SELECT id FROM tree`],
        ['third CTE', `
            WITH RECURSIVE
                a(id) AS (SELECT id FROM src),
                b(id) AS (SELECT id FROM a),
                c(id) AS (SELECT id FROM b UNION ALL SELECT id + 1 FROM c WHERE id < 5)
            SELECT id FROM c`],
    ];

    describe.each(shapes)('%s', (_label, sql) => {
        it.each(RECURSIVE_DIALECTS)('lists only the physical source table in %s', (dialect) => {
            const result = flow(sql, dialect);
            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();
            expect([...result.tableUsage.keys()]).toEqual(['src']);
            expect(workspaceTables(sql, dialect)).toEqual(['src']);
        });
    });

    it.each(['Snowflake', 'SQLite'] as const)(
        'treats a parenthesized recursive UNION arm as recursive in %s without the RECURSIVE keyword',
        (dialect) => {
            const sql = 'WITH c(id) AS (SELECT id FROM src UNION ALL (SELECT id FROM c WHERE id < 5)) SELECT id FROM c';
            const result = flow(sql, dialect);
            expect(result.error).toBeUndefined();
            expect([...result.tableUsage.keys()]).toEqual(['src']);
            expect(workspaceTables(sql, dialect)).toEqual(['src']);
        }
    );

    it.each(RECURSIVE_DIALECTS.filter(dialect => dialect !== 'Snowflake' && dialect !== 'SQLite'))(
        'keeps a non-recursive CTE named after its source table pointing at the table in %s',
        (dialect) => {
            // Without RECURSIVE (and outside SQL Server / Oracle, where a self-named
            // CTE is always recursive) the inner `orders` is the physical table.
            const sql = 'WITH a AS (SELECT 1 AS x), orders AS (SELECT * FROM orders) SELECT * FROM orders';
            const result = flow(sql, dialect);
            const cte = result.nodes.find(node => node.type === 'cte' && node.label.endsWith('orders'));
            expect(cte?.children?.find(node => node.type === 'table')?.tableCategory).toBe('physical');
            expect([...result.tableUsage.keys()]).toEqual(['orders']);
            expect(workspaceTables(sql, dialect)).toEqual(['orders']);
        }
    );
});

describe('keyword-named qualified columns keep CTE bindings', () => {
    const keywords = ['order', 'group', 'from', 'limit', 'where', 'join', 'select', 'offset', 'having', 'union'];
    const sqlFor = (column: string) => `
        WITH "C" AS (SELECT id, s.${column} FROM src s)
        SELECT q.id
        FROM "C" q
        JOIN other o ON q.${column} = o.id
        WHERE q.${column} > 0
        GROUP BY q.id, q.${column}
        ORDER BY q.${column}`;

    describe.each(['PostgreSQL', 'Snowflake'] as const)('%s', (dialect) => {
        it.each(keywords)('q.%s in every clause', (column) => {
            const result = flow(sqlFor(column), dialect);
            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();
            expect(result.nodes.find(node => node.type === 'table' && node.label === 'C')?.tableCategory).toBe('cte_reference');
            expect([...result.tableUsage.keys()]).toEqual(['src', 'other']);
        });
    });
});

describe('star exclusions beyond a single column', () => {
    const deadHints = (result: ReturnType<typeof flow>) =>
        result.hints.filter(hint => hint.message.includes('dead column')).map(hint => hint.message);

    it.each([
        ['BigQuery', 'WITH c AS (SELECT id, a, b, secret FROM src) SELECT * EXCEPT (a, secret) FROM c'],
        ['Snowflake', 'WITH c AS (SELECT id, a, b, secret FROM src) SELECT * EXCLUDE (a, secret) FROM c'],
    ] as const)('drops every excluded column in %s', (dialect, sql) => {
        const result = flow(sql, dialect);
        expect(result.columnLineage.map(column => column.outputColumn)).toEqual(['id', 'b']);
        expect(deadHints(result)).toEqual(['2 dead columns detected: a, secret']);
    });

    it.each([
        ['BigQuery', 'WITH c AS (SELECT id, secret FROM src), d AS (SELECT id, note FROM t2) SELECT c.* EXCEPT (secret), d.note FROM c JOIN d ON c.id = d.id'],
        ['Snowflake', 'WITH c AS (SELECT id, secret FROM src), d AS (SELECT id, note FROM t2) SELECT c.* EXCLUDE (secret), d.note FROM c JOIN d ON c.id = d.id'],
    ] as const)('applies a qualified exclusion only to its own relation in %s', (dialect, sql) => {
        const result = flow(sql, dialect);
        expect(result.columnLineage.map(column => column.outputColumn)).toEqual(['id', 'note']);
        expect(deadHints(result)).toEqual(['1 dead column detected: secret']);
    });

    it.each([
        ['BigQuery', 'WITH c AS (SELECT id, secret FROM src) SELECT * EXCEPT (SECRET) FROM c'],
        ['Snowflake', 'WITH c AS (SELECT id, secret FROM src) SELECT * EXCLUDE (SECRET) FROM c'],
    ] as const)('matches unquoted excluded names case-insensitively in %s', (dialect, sql) => {
        expect(flow(sql, dialect).columnLineage.map(column => column.outputColumn)).toEqual(['id']);
    });

    it('leaves the star unexpanded when every column is excluded', () => {
        const result = flow('WITH c AS (SELECT secret FROM src) SELECT * EXCEPT (secret) FROM c', 'BigQuery');
        expect(result.error).toBeUndefined();
        expect(result.columnLineage.map(column => column.outputColumn)).toEqual(['*']);
    });
});

describe('SELECT INTO navigation after leading comments and earlier statements', () => {
    it.each([
        ['PostgreSQL', '/* header\n   line 2\n   line 3 */\nSELECT id\nINTO "my schema"."my table"\nFROM orders;', 5, 4],
        ['TransactSQL', '-- one\n-- two\nSELECT id INTO [dbo].[t2] FROM dbo.orders;', 3, 3],
        ['PostgreSQL', 'SELECT 1;\n\nSELECT id\nINTO archive.t3\nFROM orders;', 4, 3],
    ] as const)('%s: SQL Flow write and Workspace definition skip comments (%#)', (dialect, sql, intoLine, statementLine) => {
        const batch = parseSqlBatch(sql, dialect);
        const query = batch.queries[batch.queries.length - 1];
        expect(query.partial).toBeUndefined();
        expect(query.nodes.find(node => node.accessMode === 'write')?.startLine).toBe(intoLine);
        const definitions = new SchemaExtractor().extractDefinitions(sql, '/audit.sql', dialect);
        expect(definitions.map(definition => definition.lineNumber)).toEqual([statementLine]);
    });
});

describe('large CTE chains stay fast', () => {
    const time = (sql: string) => {
        const start = performance.now();
        const result = flow(sql, 'PostgreSQL');
        return { result, elapsedMs: performance.now() - start };
    };

    it('star-projection chains', () => {
        const ctes = ['cte_0 AS (SELECT ' + Array.from({ length: 20 }, (_, j) => `c${j}`).join(', ') + ' FROM base_table)'];
        for (let i = 1; i < 140; i++) { ctes.push(`cte_${i} AS (SELECT p.*, p.c0 + ${i} AS x${i} FROM cte_${i - 1} p)`); }
        const { result, elapsedMs } = time(`WITH ${ctes.join(',\n')}\nSELECT c0 FROM cte_139`);
        expect(result.error).toBeUndefined();
        expect(elapsedMs).toBeLessThan(2000);
    });

    it('keyword-named qualified columns in every CTE', () => {
        const ctes = ['cte_0 AS (SELECT s.id, s.offset, s.limit, s.order FROM base_table s)'];
        for (let i = 1; i < 140; i++) {
            ctes.push(`cte_${i} AS (SELECT p.id, p.offset, p.limit, p.order FROM cte_${i - 1} p JOIN dim d ON p.offset = d.offset WHERE p.limit > 0)`);
        }
        const { result, elapsedMs } = time(`WITH ${ctes.join(',\n')}\nSELECT id FROM cte_139`);
        expect(result.error).toBeUndefined();
        expect(result.hints.some(hint => hint.message.includes('dead column'))).toBe(true);
        expect(elapsedMs).toBeLessThan(2000);
    });
});
