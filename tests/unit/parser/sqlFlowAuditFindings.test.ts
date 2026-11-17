import { parseSql, parseSqlBatch } from '../../../src/webview/sqlParser';
import { formatSql } from '../../../src/webview/sqlFormatter';
import { preprocessTransactSqlSyntax } from '../../../src/webview/parser/dialects/preprocessing';
import { computeCompareDiff } from '../../../src/webview/ui/compareView';
import { ReferenceExtractor } from '../../../src/workspace/extraction';
import { splitSqlStatementsWithOffsets } from '../../../src/webview/parser/validation/splitting';

describe('SQL Flow parser audit regressions', () => {
    it('connects only the unqualified relation to a same-named CTE', () => {
        const result = parseSql(`
            WITH orders AS (SELECT id FROM archived)
            SELECT p.id AS live_id, c.id AS old_id
            FROM public.orders p JOIN orders c ON p.id = c.id;
        `, 'PostgreSQL');
        const cte = result.nodes.find(node => node.type === 'cte')!;
        const physical = result.nodes.find(node => node.alias === 'p')!;
        const reference = result.nodes.find(node => node.alias === 'c')!;
        expect(physical.tableCategory).toBe('physical');
        expect(reference.tableCategory).toBe('cte_reference');
        expect(result.edges.filter(edge => edge.source === cte.id).map(edge => edge.target)).toEqual([reference.id]);
        expect(result.columnLineage?.find(column => column.outputColumn === 'live_id')?.sources[0]?.nodeId).toBe(physical.id);
    });

    it('distinguishes a case-sensitive CTE from its lowercase physical relation', () => {
        const result = parseSql(`
            WITH "Orders" AS (SELECT id FROM archived)
            SELECT p.id FROM orders p JOIN "Orders" c ON p.id = c.id;
        `, 'PostgreSQL');
        expect(result.nodes.find(node => node.alias === 'p')?.tableCategory).toBe('physical');
        expect(result.nodes.find(node => node.alias === 'c')?.tableCategory).toBe('cte_reference');
    });

    it('keeps a later, nonrecursive CTE out of an earlier body', () => {
        const result = parseSql(`
            WITH a AS (SELECT id FROM later), later AS (SELECT id FROM archived)
            SELECT id FROM a;
        `, 'PostgreSQL');
        const first = result.nodes.find(node => node.label === 'WITH a')!;
        const later = result.nodes.find(node => node.label === 'WITH later')!;
        expect(first.children?.find(node => node.label === 'later')?.tableCategory).toBe('physical');
        expect(result.edges.some(edge => edge.source === later.id && edge.target === first.id)).toBe(false);
    });

    it('expands a known CTE wildcard before matching UNION columns', () => {
        const result = parseSql(`
            WITH a AS (SELECT id, name FROM accounts), b AS (SELECT id, name, score FROM archived)
            SELECT a.*, a.id AS tail FROM a
            UNION ALL SELECT b.id, b.name, b.score FROM b;
        `, 'PostgreSQL');
        const tail = result.columnLineage?.find(column => column.outputColumn === 'tail');
        expect(tail?.sources.map(source => `${source.table}.${source.column}`)).toEqual(['a.id', 'b.score']);
        expect(result.hints.some(hint => hint.message.includes('different column counts'))).toBe(false);
    });

    it('preserves known UNION ordinals and avoids guessing past an unresolved wildcard', () => {
        const result = parseSql(`
            SELECT a.id AS head, a.*, a.id AS tail FROM accounts a
            UNION ALL SELECT b.id, b.name, b.score, b.status FROM archived b;
        `, 'PostgreSQL');
        const sources = (output: string) => result.columnLineage?.find(column => column.outputColumn === output)?.sources
            .map(source => `${source.table}.${source.column}`);
        expect(sources('head')).toEqual(['accounts.id', 'archived.id']);
        expect(sources('tail')).toEqual(['accounts.id']);
        expect(result.hints.some(hint => hint.message.includes('different column counts'))).toBe(false);
    });

    it.each([
        ['PostgreSQL', 'SELECT id INTO archive FROM orders WHERE active=false;', 'archive'],
        ['TransactSQL', 'SELECT id INTO #archive FROM dbo.orders WHERE active=0;', '#archive'],
    ] as const)('shows a table write for %s SELECT INTO', (dialect, sql, target) => {
        const result = parseSql(sql, dialect);
        const write = result.nodes.find(node => node.label === target && node.accessMode === 'write');
        const select = result.nodes.find(node => node.type === 'select');
        expect(result.partial).not.toBe(true);
        expect(write?.operationType).toBe('CREATE_TABLE');
        expect(result.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: select?.id, target: write?.id })]));
    });

    it('keeps MySQL SELECT INTO variable assignment out of the table graph', () => {
        const result = parseSql('SELECT id INTO @destination FROM orders;', 'MySQL');
        expect(result.nodes.some(node => node.accessMode === 'write')).toBe(false);
    });

    it('preserves MySQL hash comments and leaves T-SQL temp identifiers intact', () => {
        const formatted = formatSql('SELECT id # WHERE tenant_id = 7 $&\nFROM accounts;', { dialect: 'MySQL' });
        expect(formatted).toContain('# WHERE tenant_id = 7 $&\n');
        expect(parseSql(formatted, 'MySQL').partial).not.toBe(true);
        const tsql = formatSql('select id from #orders where id = 1;', { dialect: 'TransactSQL' });
        expect(tsql).toMatch(/FROM #orders\s+WHERE id/);
    });

    it('renders Athena UNNEST with an alias column list as a table function', () => {
        const result = parseSql(`
            SELECT o.customer_id, COUNT(*) AS cnt FROM orders o
            CROSS JOIN UNNEST(o.items) AS i(item) GROUP BY o.customer_id;
        `, 'Athena');
        expect(result.partial).not.toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.nodes.find(node => node.label === 'i')?.tableCategory).toBe('table_function');
    });

    it.each([
        'WITH w AS (SELECT a.id, a.email FROM accounts a) SELECT w.* FROM w;',
        'WITH w AS (SELECT a.id, a.email FROM accounts a) SELECT w.id FROM w UNION ALL SELECT w.email FROM w;',
        `SELECT a.id, s.amount FROM accounts a LEFT JOIN LATERAL
           (SELECT amount FROM orders WHERE customer_id = a.id ORDER BY created_at DESC LIMIT 1) s ON true;`,
    ])('does not flag consumed intermediate columns in %s', (sql) => {
        expect(parseSql(sql, 'PostgreSQL').hints.some(hint => hint.message.includes('dead column'))).toBe(false);
    });

    it('keeps splitter offsets and counts through dense one-line semicolons and comments', () => {
        const sql = 'SELECT 1; /* note */ SELECT 2; '.repeat(2000) + '-- tail\nSELECT 3;';
        const statements = splitSqlStatementsWithOffsets(sql, 'PostgreSQL');
        expect(statements).toHaveLength(4001);
        expect(statements[1]).toEqual({ sql: '/* note */ SELECT 2', start: sql.indexOf('/* note */') });
        expect(statements.at(-1)).toEqual({ sql: 'SELECT 3', start: sql.lastIndexOf('SELECT 3') });
        expect(parseSqlBatch(sql, 'PostgreSQL').queries).toHaveLength(50);
    });

    it('rewrites balanced OPENJSON clauses despite brackets and incomplete surrounding calls', () => {
        const sql = "SELECT * FROM OPENJSON(OPENJSON(@json) WITH ([odd)] INT '$.id')";
        expect(preprocessTransactSqlSyntax(sql, 'TransactSQL')).toBe('SELECT * FROM OPENJSON(OPENJSON(@json) ');
        const malformed = 'SELECT id FROM accounts WHERE EXISTS (' + 'SELECT id FROM OPENJSON('.repeat(500);
        expect(parseSqlBatch(malformed, 'TransactSQL').queries[0].partial).toBe(true);
    });

    it.each(['Snowflake', 'SQLite', 'TransactSQL'] as const)('keeps the self-reference of a keyword-less recursive CTE in %s', (dialect) => {
        const result = parseSql('WITH t AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM t WHERE n < 5) SELECT n FROM t', dialect);
        const cte = result.nodes.find(node => node.type === 'cte')!;
        expect(cte.children?.find(node => node.label === 't')?.tableCategory).toBe('cte_reference');
    });

    it('reads the physical relation from a plain self-named Snowflake CTE body', () => {
        const result = parseSql('WITH source AS (SELECT raw FROM source) SELECT raw FROM source', 'Snowflake');
        const cte = result.nodes.find(node => node.type === 'cte')!;
        expect(cte.children?.find(node => node.label === 'source')?.tableCategory).toBe('physical');
    });

    it('matches BigQuery CTE names without regard to case', () => {
        const result = parseSql('WITH Foo AS (SELECT 1 AS n) SELECT n FROM foo', 'BigQuery');
        expect(result.nodes.find(node => node.label === 'foo')?.tableCategory).toBe('cte_reference');
    });

    it.each([
        `WITH pairs AS (SELECT a.id AS product_a, b.id AS product_b FROM items a JOIN items b ON a.o = b.o)
         SELECT p1.name, p2.name FROM pairs csr
         JOIN products p1 ON csr.product_a = p1.id
         JOIN products AS p2 ON csr.product_b = p2.id`,
        `WITH hv AS (SELECT c.id, c.name FROM customers c),
              recent AS (SELECT hv.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = hv.id) AS recent_orders FROM hv)
         SELECT id, name, recent_orders FROM recent`,
    ])('does not flag columns used by a later join or produced inside a scalar subquery: %#', (sql) => {
        expect(parseSql(sql, 'PostgreSQL').hints.filter(hint => hint.message.includes('dead column'))).toEqual([]);
    });

    it('still flags a CTE output that nothing downstream reads', () => {
        const hints = parseSql('WITH c AS (SELECT a, b FROM t) SELECT a FROM c', 'PostgreSQL').hints;
        expect(hints.some(hint => hint.message === '1 dead column detected: b')).toBe(true);
    });

    it('treats an unquoted case change in a PostgreSQL CTE join as the same relation', () => {
        const before = 'WITH c AS (SELECT a.id FROM a JOIN Users u ON u.id = a.id) SELECT id FROM c';
        const diff = computeCompareDiff(parseSql(before, 'PostgreSQL'), parseSql(before.replace('Users', 'users'), 'PostgreSQL'));
        expect([diff.addedNodeKeys, diff.removedNodeKeys, diff.changedNodeKeys]).toEqual([[], [], []]);
        const quoted = computeCompareDiff(parseSql(before, 'PostgreSQL'), parseSql(before.replace('Users', '"Users"'), 'PostgreSQL'));
        expect(quoted.changedNodeKeys).toHaveLength(1);
    });

    it('formats hash characters as SQL when no dialect is given', () => {
        expect(formatSql("select a #> '{b}' as x from t where d = 1")).toMatch(/FROM t\s+WHERE d = 1/);
        expect(formatSql('select id from #orders where id = 1')).toMatch(/FROM #orders\s+WHERE id = 1/);
    });

    it.each([
        'WITH orders AS (SELECT id, items FROM raw) SELECT o.id, item FROM orders o CROSS JOIN UNNEST(o.items) AS item',
        'WITH t AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM t WHERE n < 5) SELECT n FROM t',
    ])('does not flag table-function arguments or unnamed recursive expressions: %#', (sql) => {
        expect(parseSql(sql, 'PostgreSQL').hints.filter(hint => hint.message.includes('dead column'))).toEqual([]);
    });

    it.each([
        ['PostgreSQL', 'SELECT id INTO myschema.archive FROM orders;', 'myschema.archive'],
        ['PostgreSQL', 'SELECT id INTO TEMP TABLE archive FROM orders;', 'archive'],
        ['TransactSQL', 'SELECT a, b INTO dbo.new_t FROM dbo.old_t;', 'dbo.new_t'],
        ['TransactSQL', 'SELECT a INTO [dbo].[new t] FROM dbo.old_t;', 'dbo.new t'],
    ] as const)('parses a qualified or temporary %s SELECT INTO target', (dialect, sql, target) => {
        const result = parseSql(sql, dialect);
        expect(result.partial).not.toBe(true);
        expect(result.nodes.find(node => node.accessMode === 'write')?.label).toBe(target);
    });

    it('leaves INSERT INTO and variable targets alone', () => {
        const insert = parseSql('INSERT INTO s.target SELECT id FROM s.source;', 'PostgreSQL');
        expect(insert.partial).not.toBe(true);
        expect(insert.nodes.some(node => node.label === 's.target')).toBe(false);
        expect(parseSql('SELECT @v = id FROM dbo.t;', 'TransactSQL').nodes.some(node => node.accessMode === 'write')).toBe(false);
    });

    it.each(['Snowflake', 'SQLite'] as const)('does not list a keyword-less recursive CTE as a %s workspace reference', (dialect) => {
        const sql = 'CREATE VIEW v AS WITH t AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM t WHERE n < 5) SELECT n FROM t;';
        const parsed = new ReferenceExtractor().extractReferencesWithStatus(sql, '/a.sql', dialect);
        expect(parsed.references.map(reference => reference.tableName)).not.toContain('t');
    });
});
