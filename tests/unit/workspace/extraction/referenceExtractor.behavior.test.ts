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
