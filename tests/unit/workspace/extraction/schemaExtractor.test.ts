import { SchemaExtractor } from '../../../../src/workspace/extraction/schemaExtractor';

describe('SchemaExtractor.extractDefinitions', () => {
    let extractor: SchemaExtractor;

    beforeEach(() => {
        extractor = new SchemaExtractor();
    });

    describe('CREATE TABLE via AST parser', () => {
        it('extracts a simple CREATE TABLE', () => {
            const sql = 'CREATE TABLE orders (id INT, customer_id INT, amount DECIMAL(10,2));';
            const defs = extractor.extractDefinitions(sql, '/sql/orders.sql', 'MySQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].type).toBe('table');
            expect(defs[0].name).toBe('orders');
            expect(defs[0].filePath).toBe('/sql/orders.sql');
            expect(defs[0].columns.length).toBeGreaterThanOrEqual(2);
        });

        it('extracts schema-qualified CREATE TABLE', () => {
            const sql = 'CREATE TABLE public.users (id INT, name VARCHAR(100));';
            const defs = extractor.extractDefinitions(sql, '/sql/users.sql', 'PostgreSQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].name).toBe('users');
            expect(defs[0].schema).toBe('public');
        });

        it('extracts multiple CREATE TABLE statements', () => {
            const sql = `
                CREATE TABLE orders (id INT);
                CREATE TABLE products (id INT, name VARCHAR(100));
            `;
            const defs = extractor.extractDefinitions(sql, '/sql/schema.sql', 'MySQL');

            expect(defs.length).toBeGreaterThanOrEqual(2);
            const names = defs.map(d => d.name);
            expect(names).toContain('orders');
            expect(names).toContain('products');
        });

        it('extracts column details including data type', () => {
            const sql = 'CREATE TABLE items (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL, price DECIMAL(10,2));';
            const defs = extractor.extractDefinitions(sql, '/sql/items.sql', 'MySQL');

            expect(defs).toHaveLength(1);
            const columns = defs[0].columns;
            expect(columns.length).toBeGreaterThanOrEqual(2);
            const idCol = columns.find(c => c.name === 'id');
            expect(idCol).toBeDefined();
        });

        it('unwraps PostgreSQL column AST wrappers into string names', () => {
            const sql = 'CREATE TABLE accounts (id INT, name TEXT);';
            const defs = extractor.extractDefinitions(sql, '/sql/accounts.sql', 'PostgreSQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].columns.map(col => col.name)).toEqual(['id', 'name']);
        });
    });

    describe('CREATE VIEW via AST parser', () => {
        it('extracts a simple CREATE VIEW', () => {
            const sql = 'CREATE VIEW active_users AS SELECT id, name FROM users WHERE active = 1;';
            const defs = extractor.extractDefinitions(sql, '/sql/views.sql', 'MySQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].type).toBe('view');
            expect(defs[0].name).toBe('active_users');
        });

        it('extracts CREATE OR REPLACE VIEW', () => {
            const sql = 'CREATE OR REPLACE VIEW recent_orders AS SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 7 DAY;';
            const defs = extractor.extractDefinitions(sql, '/sql/views.sql', 'MySQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].type).toBe('view');
            expect(defs[0].name).toBe('recent_orders');
        });

        it('unwraps quoted PostgreSQL explicit view column names', () => {
            const sql = 'CREATE VIEW order_view ("Order ID", total) AS SELECT id, amount FROM orders;';
            const defs = extractor.extractDefinitions(sql, '/sql/views.sql', 'PostgreSQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].columns.map(column => column.name)).toEqual(['Order ID', 'total']);
        });
    });

    describe('statement SQL boundaries', () => {
        it.each([
            {
                label: 'CTAS target',
                sql: 'CREATE TABLE created_orders AS SELECT order_id FROM orders;',
            },
            {
                label: 'view target',
                sql: 'CREATE VIEW v_created_today AS SELECT order_id FROM orders;',
            },
            {
                label: 'selected column',
                sql: 'CREATE TABLE snapshot AS SELECT created_at FROM orders;',
            },
            {
                label: 'declared column',
                sql: 'CREATE TABLE orders (\n id INT,\n created_at TIMESTAMP\n);',
            },
        ])('does not stop at CREATE inside a $label identifier', ({ sql }) => {
            const defs = extractor.extractDefinitions(
                sql,
                '/sql/create-identifiers.sql',
                'PostgreSQL'
            );

            expect(defs).toHaveLength(1);
            expect(defs[0].sql).toBe(sql);
        });

        it.each([
            { dialect: 'PostgreSQL' as const, identifier: '"create"' },
            { dialect: 'MySQL' as const, identifier: '`create`' },
            { dialect: 'TransactSQL' as const, identifier: '[create]' },
        ])('ignores CREATE inside $identifier quoted identifiers', ({ dialect, identifier }) => {
            const sql = `CREATE TABLE snapshot AS SELECT ${identifier} FROM source_table;`;
            const defs = extractor.extractDefinitions(sql, '/sql/quoted-create.sql', dialect);

            expect(defs).toHaveLength(1);
            expect(defs[0].sql).toContain(`${identifier} FROM source_table`);
        });
    });

    describe('regex fallback', () => {
        it('falls back to regex for unsupported syntax', () => {
            // Dialect set to something that will cause parser to fail
            const sql = 'CREATE TABLE my_table (id INT); @@some_invalid_syntax@@;';
            const defs = extractor.extractDefinitions(sql, '/sql/test.sql', 'MySQL');

            // Should extract at least the CREATE TABLE via regex fallback or parser
            expect(defs.length).toBeGreaterThanOrEqual(1);
            const names = defs.map(d => d.name.toLowerCase());
            expect(names).toContain('my_table');
        });

        it('extracts CREATE TABLE IF NOT EXISTS via regex', () => {
            // Force regex path with invalid trailing syntax
            const sql = `
                INVALID_SYNTAX_HERE;
                CREATE TABLE IF NOT EXISTS events (
                    id INT,
                    event_type VARCHAR(50)
                );
            `;
            const defs = extractor.extractDefinitions(sql, '/sql/events.sql', 'MySQL');

            const names = defs.map(d => d.name.toLowerCase());
            expect(names).toContain('events');
        });

        it('extracts schema-qualified table from regex fallback', () => {
            const sql = `
                THIS WILL FAIL PARSING;
                CREATE TABLE analytics.page_views (id INT, url TEXT);
            `;
            const defs = extractor.extractDefinitions(sql, '/sql/analytics.sql', 'MySQL');

            // Should find page_views, possibly with schema
            expect(defs.length).toBeGreaterThanOrEqual(1);
        });

        it('does not borrow a later table body for a CTAS definition', () => {
            const sql = [
                'CREATE TABLE snapshot AS SELECT 1;',
                'CREATE TABLE later_table (id INT);',
                '@@force_regex_fallback@@'
            ].join('\n');
            const defs = extractor.extractDefinitions(sql, '/sql/fallback.sql', 'MySQL');

            expect(defs.find(def => def.name === 'snapshot')?.columns).toEqual([]);
            expect(defs.find(def => def.name === 'later_table')?.columns.map(column => column.name)).toEqual(['id']);
        });

        it('does not treat a parenthesized CTAS query as a column-definition body', () => {
            const sql = [
                'CREATE TABLE snapshot AS (SELECT 1 AS id);',
                '@@force_regex_fallback@@'
            ].join('\n');
            const defs = extractor.extractDefinitions(sql, '/sql/fallback.sql', 'MySQL');

            expect(defs.find(def => def.name === 'snapshot')?.columns).toEqual([]);
        });

        it.each([
            {
                dialect: 'PostgreSQL' as const,
                table: '"Sales Data"."Order Items"',
                firstColumn: '"Order ID"',
            },
            {
                dialect: 'MySQL' as const,
                table: '`Sales Data`.`Order Items`',
                firstColumn: '`Order ID`',
            },
            {
                dialect: 'TransactSQL' as const,
                table: '[Sales Data].[Order Items]',
                firstColumn: '[Order ID]',
            },
        ])('preserves quoted identifiers on $dialect regex fallback', ({ dialect, table, firstColumn }) => {
            const sql = `
                CREATE TABLE ${table} (
                    ${firstColumn} INT,
                    "Display, Name" VARCHAR(100)
                );
                @@invalid@@
            `;

            const defs = extractor.extractDefinitions(sql, '/sql/quoted.sql', dialect);

            expect(defs).toHaveLength(1);
            expect(defs[0]).toMatchObject({
                type: 'table',
                schema: 'Sales Data',
                name: 'Order Items',
            });
            expect(defs[0].columns.map(column => column.name)).toEqual([
                'Order ID',
                'Display, Name',
            ]);
        });

        it('does not split a column definition at a comma inside a string default', () => {
            const sql = `
                CREATE TABLE contacts (
                    id INT,
                    surname VARCHAR(100) DEFAULT 'Smith, John' NOT NULL
                );
                @@invalid@@
            `;

            const defs = extractor.extractDefinitions(sql, '/sql/contacts.sql', 'MySQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].columns.map(column => column.name)).toEqual(['id', 'surname']);
            expect(defs[0].columns.find(column => column.name === 'surname')).toMatchObject({
                nullable: false,
            });
        });

        it('ignores CREATE TABLE text inside string literals during regex fallback', () => {
            const sql = `
                SELECT 'CREATE TABLE phantom_table (fake_id INT)' AS example;
                CREATE TABLE real_table (real_id INT);
                @@invalid@@
            `;

            const defs = extractor.extractDefinitions(sql, '/sql/string-example.sql', 'MySQL');

            expect(defs.map(definition => definition.name)).toEqual(['real_table']);
        });

        it('preserves multiline local and global temp-table targets', () => {
            jest.spyOn((extractor as any).parser, 'astify').mockImplementation(() => {
                throw new Error('force regex fallback');
            });
            const sql = `
                CREATE TABLE
                #staging (id INT);
                CREATE TABLE
                ##global_staging (id INT);
                @@invalid@@
            `;

            const defs = extractor.extractDefinitions(sql, '/sql/temp-tables.sql', 'TransactSQL');

            expect(defs.map(def => def.name)).toEqual(['#staging', '##global_staging']);
            for (const def of defs) {
                expect(def.sql).toContain(def.name);
            }
        });

        it('treats dollar, hash, and at signs as identifier characters at boundaries', () => {
            jest.spyOn((extractor as any).parser, 'astify').mockImplementation(() => {
                throw new Error('force regex fallback');
            });
            const sql = `
                CREATE TABLE $created_orders (id INT);
                CREATE TABLE @created_orders (id INT);
                CREATE TABLE #created_orders (id INT);
            `;

            const defs = extractor.extractDefinitions(sql, '/sql/sigil-identifiers.sql', 'MySQL');

            expect(defs.map(def => def.name)).toEqual([
                '$created_orders',
                '@created_orders',
                '#created_orders',
            ]);
            for (const def of defs) {
                expect(def.sql).toContain(def.name);
            }
        });

        it('does not remask the full source once per extracted definition', () => {
            const maskSpy = jest.spyOn(extractor as any, 'maskSqlComments');
            const sql = `
                CREATE TABLE first_table (id INT);
                CREATE TABLE second_table (id INT);
                CREATE TABLE third_table (id INT);
            `;

            expect(extractor.extractDefinitions(sql, '/sql/multiple.sql', 'MySQL')).toHaveLength(3);
            expect(maskSpy.mock.calls.length).toBeLessThanOrEqual(2);
        });
    });

    describe('mixed statements', () => {
        it('extracts both tables and views from same file', () => {
            const sql = `
                CREATE TABLE customers (id INT, name VARCHAR(100));
                CREATE VIEW vip_customers AS SELECT * FROM customers WHERE vip = 1;
            `;
            const defs = extractor.extractDefinitions(sql, '/sql/mixed.sql', 'MySQL');

            expect(defs.length).toBeGreaterThanOrEqual(2);
            const types = defs.map(d => d.type);
            expect(types).toContain('table');
            expect(types).toContain('view');
        });

        it('skips non-CREATE statements', () => {
            const sql = `
                INSERT INTO orders VALUES (1, 100);
                SELECT * FROM users;
                CREATE TABLE logs (id INT, message TEXT);
            `;
            const defs = extractor.extractDefinitions(sql, '/sql/test.sql', 'MySQL');

            expect(defs.length).toBe(1);
            expect(defs[0].name).toBe('logs');
        });
    });

    describe('edge cases', () => {
        it('handles empty SQL', () => {
            const defs = extractor.extractDefinitions('', '/sql/empty.sql', 'MySQL');
            expect(defs).toEqual([]);
        });

        it('handles SQL with only comments', () => {
            const sql = '-- This is a comment\n/* Block comment */';
            const defs = extractor.extractDefinitions(sql, '/sql/comments.sql', 'MySQL');
            expect(defs).toEqual([]);
        });

        it('handles SQL with line number tracking', () => {
            const sql = `
-- Header comment
-- Another comment

CREATE TABLE orders (
    id INT,
    name VARCHAR(100)
);
            `;
            const defs = extractor.extractDefinitions(sql, '/sql/orders.sql', 'MySQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].lineNumber).toBeGreaterThan(0);
        });

        it('uses the real definition location and SQL after block and hash comment examples', () => {
            const sql = `/*
CREATE TABLE accounts (block_comment_id INT);
*/
# CREATE TABLE accounts (hash_comment_id INT);
CREATE TABLE accounts (real_id INT);
`;

            const defs = extractor.extractDefinitions(sql, '/sql/accounts.sql', 'MySQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].lineNumber).toBe(5);
            expect(defs[0].sql).toBe('CREATE TABLE accounts (real_id INT);');
        });
    });
});
