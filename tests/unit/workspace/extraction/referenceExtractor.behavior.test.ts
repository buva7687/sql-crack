import { ReferenceExtractor } from '../../../../src/workspace/extraction/referenceExtractor';

describe('ReferenceExtractor behavioral coverage', () => {
    let extractor: ReferenceExtractor;

    beforeEach(() => {
        extractor = new ReferenceExtractor();
    });

    it('extracts base FROM and JOIN table references with aliases', () => {
        const refs = extractor.extractReferences(
            'SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'users',
                alias: 'u',
                referenceType: 'select',
                context: 'FROM',
            }),
            expect.objectContaining({
                tableName: 'orders',
                alias: 'o',
                referenceType: 'join',
            }),
        ]));
    });

    it('preserves schema-qualified names and schema metadata', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM analytics.users u JOIN sales.orders o ON u.id = o.user_id',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'users',
                schema: 'analytics',
                alias: 'u',
            }),
            expect.objectContaining({
                tableName: 'orders',
                schema: 'sales',
                alias: 'o',
            }),
        ]));
    });

    it('preserves catalog, schema, and quoting for three-part SQL Server references', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM [warehouse].[sales].[orders];',
            'query.sql',
            'TransactSQL'
        );

        expect(refs).toEqual([
            expect.objectContaining({
                catalog: 'warehouse',
                schema: 'sales',
                tableName: 'orders',
                catalogQuoted: true,
                schemaQuoted: true,
                nameQuoted: true,
            }),
        ]);
    });

    it('preserves three-part qualifiers on regex fallback', () => {
        jest.spyOn((extractor as any).parser, 'astify').mockImplementation(() => {
            throw new Error('force regex fallback');
        });
        const refs = extractor.extractReferences(
            'SELECT * FROM [warehouse].[sales].[orders];',
            'query.sql',
            'TransactSQL'
        );

        expect(refs).toEqual([
            expect.objectContaining({
                catalog: 'warehouse',
                schema: 'sales',
                tableName: 'orders',
            }),
        ]);
    });

    it('extracts real tables from subqueries without leaking the subquery alias', () => {
        const refs = extractor.extractReferences(
            `
            SELECT *
            FROM (SELECT id FROM inner_table) t
            JOIN outer_table o ON t.id = o.id
            `,
            'query.sql',
            'MySQL'
        );

        const names = refs.map(ref => ref.tableName.toLowerCase());
        expect(names).toContain('inner_table');
        expect(names).toContain('outer_table');
        expect(names).not.toContain('t');
    });

    it('captures INSERT target tables and source SELECT tables', () => {
        const refs = extractor.extractReferences(
            'INSERT INTO target_table (id) SELECT id FROM source_table',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'target_table',
                referenceType: 'insert',
                context: 'INSERT INTO',
            }),
            expect.objectContaining({
                tableName: 'source_table',
                referenceType: 'select',
                context: 'FROM',
            }),
        ]));
    });

    it('preserves reference line numbers after multiline block comments', () => {
        const sql = [
            '/*',
            ' * generated model header',
            ' * dependency documentation',
            ' * keep these lines',
            ' */',
            'SELECT *',
            'FROM source_table;',
        ].join('\n');

        const refs = extractor.extractReferences(sql, 'query.sql', 'PostgreSQL');

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'source_table',
                lineNumber: 7,
            }),
        ]));
    });

    it('keeps fallback references after inline comment markers in PostgreSQL dollar strings', () => {
        const result = extractor.extractReferencesWithStatus(
            'SELECT $$-- literal$$ AS x FROM source_table FOR NO KEY UPDATE SKIP LOCKED;',
            'dollar-quoted.sql',
            'PostgreSQL'
        );

        expect(result.warnings).toHaveLength(1);
        expect(result.references).toEqual([
            expect.objectContaining({
                tableName: 'source_table',
                referenceType: 'select',
                lineNumber: 1,
                statementIndex: 0,
            }),
        ]);
    });

    it('keeps CTE scope intact across semicolons inside dollar-quoted literals', () => {
        jest.spyOn((extractor as any).parser, 'astify').mockImplementation(() => {
            throw new Error('force regex fallback');
        });
        const refs = extractor.extractReferences(
            `WITH stage_one AS (
                SELECT $$seed;v1$$ AS marker FROM src
            ), stage_two AS (
                SELECT * FROM stage_one
            )
            SELECT * FROM stage_two;`,
            'dollar-cte.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual([
            expect.objectContaining({ tableName: 'src', statementIndex: 0 }),
        ]);
    });

    it('does not treat UPDATE embedded in a column name as an UPDATE statement', () => {
        jest.spyOn((extractor as any).parser, 'astify').mockImplementation(() => {
            throw new Error('force regex fallback');
        });
        const refs = extractor.extractReferences(
            'SELECT updated_at FROM orders; SELECT * FROM (SELECT * FROM src) orders WHERE (',
            'updated-column.sql',
            'PostgreSQL'
        );

        expect(refs.map(ref => ref.tableName)).toEqual(expect.arrayContaining(['orders', 'src']));
    });

    it('keeps a real top-level UPDATE after fallback CTE declarations', () => {
        jest.spyOn((extractor as any).parser, 'astify').mockImplementation(() => {
            throw new Error('force regex fallback');
        });

        const refs = extractor.extractReferences(
            'WITH staged AS (SELECT * FROM source_table) '
                + 'UPDATE target_table SET value = 1 FROM staged WHERE target_table.id = staged.id;',
            'cte-update.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'source_table', referenceType: 'select' }),
            expect.objectContaining({ tableName: 'target_table', referenceType: 'update' }),
        ]));
    });

    it('captures UPDATE targets and UPDATE ... FROM source tables', () => {
        const refs = extractor.extractReferences(
            `
            UPDATE target_table
            SET total = s.total
            FROM source_table s
            WHERE target_table.id = s.id
            `,
            'query.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'target_table',
                referenceType: 'update',
                context: 'UPDATE',
            }),
            expect.objectContaining({
                tableName: 'source_table',
                alias: 's',
            }),
        ]));
    });

    it('resolves SQL Server UPDATE aliases to the real write target', () => {
        const refs = extractor.extractReferences(
            `
            UPDATE o
            SET amount = s.amount
            FROM dbo.orders AS o
            JOIN dbo.staging AS s ON o.id = s.id
            `,
            'query.sql',
            'TransactSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'orders',
                schema: 'dbo',
                referenceType: 'update',
                context: 'UPDATE',
            }),
            expect.objectContaining({
                tableName: 'staging',
                schema: 'dbo',
                referenceType: 'join',
            }),
        ]));
    });

    it('extracts CREATE TABLE AS SELECT sources from parser query_expr bodies', () => {
        const refs = extractor.extractReferences(
            'CREATE TABLE "sales"."orders_summary" AS SELECT * FROM "sales"."orders";',
            'query.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'orders',
                schema: 'sales',
                referenceType: 'select',
            }),
        ]));
    });

    it('captures DELETE targets and subquery sources', () => {
        const refs = extractor.extractReferences(
            'DELETE FROM target_table WHERE id IN (SELECT id FROM source_table)',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'target_table',
                referenceType: 'delete',
                context: 'DELETE FROM',
            }),
            expect.objectContaining({
                tableName: 'source_table',
                referenceType: 'select',
            }),
        ]));
    });

    it('handles dialect preprocessing cases without inventing table names from syntax', () => {
        const pgRefs = extractor.extractReferences(
            "SELECT * FROM orders WHERE created_at::date = CURRENT_DATE",
            'pg.sql',
            'PostgreSQL'
        );
        const snowflakeRefs = extractor.extractReferences(
            "SELECT src:items FROM events",
            'sf.sql',
            'Snowflake'
        );

        expect(pgRefs.map(ref => ref.tableName.toLowerCase())).toContain('orders');
        expect(pgRefs.map(ref => ref.tableName.toLowerCase())).not.toContain('date');
        expect(snowflakeRefs.map(ref => ref.tableName.toLowerCase())).toContain('events');
        expect(snowflakeRefs.map(ref => ref.tableName.toLowerCase())).not.toContain('items');
    });

    it('extracts DBT ref/source tables on the AST path', () => {
        const refs = extractor.extractReferences(
            `
            WITH src AS (
                SELECT *
                FROM {{ source('raw', 'customers') }}
            )
            SELECT *
            FROM src
            JOIN {{ ref('stg_orders') }} o ON src.id = o.customer_id
            `,
            'model.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'customers',
                schema: 'raw',
            }),
            expect.objectContaining({
                tableName: 'stg_orders',
            }),
        ]));
    });

    it('extracts real table inside CTE body when CTE name shadows it', () => {
        const refs = extractor.extractReferences(
            `
            WITH orders AS (
                SELECT * FROM orders WHERE active = 1
            )
            SELECT * FROM orders
            `,
            'query.sql',
            'MySQL'
        );

        const names = refs.map(ref => ref.tableName.toLowerCase());
        // The real "orders" table inside the CTE body should be extracted
        expect(names).toContain('orders');
        // Should have exactly one reference (the real table, not the CTE usage)
        expect(refs.filter(r => r.tableName.toLowerCase() === 'orders')).toHaveLength(1);
    });

    it('does not extract CTE references as real tables in outer query', () => {
        const refs = extractor.extractReferences(
            `
            WITH staging AS (
                SELECT id, name FROM raw_customers
            ),
            enriched AS (
                SELECT s.id, s.name, o.total
                FROM staging s
                JOIN raw_orders o ON s.id = o.customer_id
            )
            SELECT * FROM enriched
            `,
            'query.sql',
            'MySQL'
        );

        const names = refs.map(ref => ref.tableName.toLowerCase());
        expect(names).toContain('raw_customers');
        expect(names).toContain('raw_orders');
        expect(names).not.toContain('staging');
        expect(names).not.toContain('enriched');
    });

    it('keeps repeated source references in separate statements with occurrence lines', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM source_table;\nINSERT INTO target_table SELECT * FROM source_table;',
            'pipeline.sql',
            'MySQL'
        );

        const sourceRefs = refs.filter(ref => ref.tableName.toLowerCase() === 'source_table');
        expect(sourceRefs).toEqual([
            expect.objectContaining({ statementIndex: 0, lineNumber: 1 }),
            expect.objectContaining({ statementIndex: 1, lineNumber: 2 }),
        ]);
    });

    it('keeps JOIN condition subquery references in the owning statement', () => {
        const refs = extractor.extractReferences(
            [
                'CREATE VIEW first_view AS SELECT * FROM first_source;',
                'CREATE VIEW second_view AS',
                'SELECT * FROM alpha',
                'JOIN beta ON beta.id IN (SELECT id FROM gamma);',
            ].join('\n'),
            'views.sql',
            'PostgreSQL'
        );

        expect(refs.find(ref => ref.tableName === 'gamma')).toMatchObject({
            statementIndex: 1,
            lineNumber: 4,
        });
    });

    it('keeps legal one-character and quoted reserved table references', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM a;\nSELECT * FROM "select";\nSELECT * FROM "123";',
            'quoted.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'a', statementIndex: 0 }),
            expect.objectContaining({
                tableName: 'select',
                statementIndex: 1,
                nameQuoted: true,
            }),
            expect.objectContaining({
                tableName: '123',
                statementIndex: 2,
                nameQuoted: true,
            }),
        ]));
    });

    it('preserves quoted reserved identifiers on safe regex fallback', () => {
        jest.spyOn((extractor as any).parser, 'astify').mockImplementation(() => {
            throw new Error('force regex fallback');
        });
        const refs = extractor.extractReferences(
            "SELECT 'FROM select' AS example FROM \"select\";",
            'quoted-fallback.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual([
            expect.objectContaining({
                tableName: 'select',
                nameQuoted: true,
                referenceType: 'select',
            }),
        ]);
    });

    it('ignores table-looking text in string literals when locating AST references', () => {
        const refs = extractor.extractReferences(
            "SELECT 'FROM orders' AS example\nFROM \"orders\";",
            'string-location.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual([
            expect.objectContaining({
                tableName: 'orders',
                nameQuoted: true,
                lineNumber: 2,
            }),
        ]);
    });

    it('keeps case-distinct quoted tables in a comma-separated FROM list', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM "users", "Users";',
            'quoted-comma-list.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'users', nameQuoted: true }),
            expect.objectContaining({ tableName: 'Users', nameQuoted: true }),
        ]));
        expect(refs).toHaveLength(2);
    });

    it('does not let a quoted CTE suppress a case-distinct PostgreSQL table', () => {
        const refs = extractor.extractReferences(
            'WITH "Foo" AS (SELECT * FROM src) SELECT * FROM "foo";',
            'quoted-cte.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'src' }),
            expect.objectContaining({ tableName: 'foo', nameQuoted: true }),
        ]));
        expect(refs.some(ref => ref.tableName === 'Foo')).toBe(false);
    });

    it('keeps case-distinct quoted JOIN relations on the same line', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM base JOIN "Users" u ON 1=1 JOIN "users" l ON 1=1;',
            'quoted-joins.sql',
            'PostgreSQL'
        ).filter(ref => ref.referenceType === 'join');

        expect(refs.map(ref => ref.tableName)).toEqual(['Users', 'users']);
    });

    it.each([
        ['TransactSQL' as const, 'MERGE INTO dbo.target_table AS t USING dbo.source_table AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.value = s.value;'],
        ['PostgreSQL' as const, 'MERGE INTO target_table AS t USING source_table AS s ON t.id = s.id WHEN MATCHED THEN UPDATE SET value = s.value;'],
        ['Snowflake' as const, 'MERGE INTO target_table t USING source_table s ON t.id = s.id WHEN MATCHED THEN UPDATE SET value = s.value;'],
        ['BigQuery' as const, 'MERGE target_table t USING source_table s ON t.id = s.id WHEN MATCHED THEN UPDATE SET value = s.value;'],
    ])('extracts MERGE target and source references for %s', (dialect, sql) => {
        const refs = extractor.extractReferences(sql, 'merge.sql', dialect);

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'target_table',
                referenceType: 'merge',
                context: 'MERGE INTO',
                statementIndex: 0,
            }),
            expect.objectContaining({
                tableName: 'source_table',
                referenceType: 'select',
                context: 'MERGE USING',
                statementIndex: 0,
            }),
        ]));
    });

    it('preserves dollar-containing MERGE targets and their sources on fallback', () => {
        const refs = extractor.extractReferences(
            'MERGE INTO my$$target t USING source_tbl s ON t.id = s.id WHEN MATCHED THEN UPDATE SET id = s.id;',
            'merge.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'my$$target',
                referenceType: 'merge',
            }),
            expect.objectContaining({
                tableName: 'source_tbl',
                referenceType: 'select',
            }),
        ]));
    });

    it('does not let a CTE name hide a physical table in a later statement', () => {
        const refs = extractor.extractReferences(
            'WITH orders AS (SELECT * FROM archive_orders) SELECT * FROM orders;\n'
                + 'INSERT INTO report SELECT * FROM orders;',
            'pipeline.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'archive_orders', statementIndex: 0 }),
            expect.objectContaining({ tableName: 'orders', statementIndex: 1, lineNumber: 2 }),
        ]));
        expect(refs).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'orders', statementIndex: 0 }),
        ]));
    });

    it('handles multiple CTEs that shadow real tables correctly', () => {
        const refs = extractor.extractReferences(
            `
            WITH users AS (
                SELECT * FROM users WHERE active = 1
            ),
            orders AS (
                SELECT * FROM orders WHERE created_at > '2024-01-01'
            )
            SELECT u.id, o.total
            FROM users u
            JOIN orders o ON u.id = o.user_id
            `,
            'query.sql',
            'MySQL'
        );

        const names = refs.map(ref => ref.tableName.toLowerCase());
        // Real tables inside CTE bodies should be extracted
        expect(names).toContain('users');
        expect(names).toContain('orders');
        // Each should appear exactly once (from CTE body, not outer CTE reference)
        expect(refs.filter(r => r.tableName.toLowerCase() === 'users')).toHaveLength(1);
        expect(refs.filter(r => r.tableName.toLowerCase() === 'orders')).toHaveLength(1);
    });

    it('extracts DBT ref tables on the regex fallback path', () => {
        const refs = extractor.extractReferences(
            `
            SELECT *
            FROM {{ ref('orders') }}
            QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) = 1
            `,
            'model.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'orders',
            }),
        ]));
    });

    it('keeps schema-distinct references on the same line', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM sales.orders o JOIN hr.orders h ON o.id = h.id',
            'schema_distinct.sql',
            'MySQL'
        );

        const ordersRefs = refs.filter(ref => ref.tableName.toLowerCase() === 'orders');
        const schemas = ordersRefs.map(ref => (ref.schema || '').toLowerCase()).sort();
        expect(ordersRefs).toHaveLength(2);
        expect(schemas).toEqual(['hr', 'sales']);
    });

    it('does not treat EXTRACT(... FROM ...) as table reference on regex fallback when comments shift indices', () => {
        const refs = extractor.extractReferences(
            `
            -- leading comment to force index drift between original and comment-stripped SQL
            /* another comment block */
            SELECT EXTRACT(YEAR FROM created_at) AS year_part
            FROM orders
            QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) = 1
            `,
            'fallback.sql',
            'MySQL'
        );

        const names = refs.map(ref => ref.tableName.toLowerCase());
        expect(names).toContain('orders');
        expect(names).not.toContain('created_at');
        expect(names).not.toContain('year');
    });

    it('handles singular WITH clause objects without throwing', () => {
        const sql = 'WITH recent_orders AS (SELECT * FROM orders) SELECT * FROM recent_orders';
        (extractor as any).parser.astify = jest.fn(() => ({
            type: 'select',
            with: {
                name: 'recent_orders',
                stmt: {
                    type: 'select',
                    from: [{ table: 'orders' }],
                    columns: ['*']
                }
            },
            from: [{ table: 'recent_orders' }],
            columns: ['*']
        }));

        const refs = extractor.extractReferences(sql, 'query.sql', 'MySQL');

        expect(refs).toEqual([
            expect.objectContaining({
                tableName: 'orders',
                referenceType: 'select'
            })
        ]);
    });
});
