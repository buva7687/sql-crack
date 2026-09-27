import { SchemaExtractor } from '../../../../src/workspace/extraction/schemaExtractor';

describe('SchemaExtractor.extractDefinitions', () => {
    let extractor: SchemaExtractor;

    beforeEach(() => {
        extractor = new SchemaExtractor();
    });

    it('finds definitions after a MySQL procedure using DELIMITER $$', () => {
        const sql = [
            'CREATE TABLE src (id INT);',
            'DELIMITER $$',
            'CREATE PROCEDURE p() BEGIN SELECT id FROM src; END $$',
            'DELIMITER ;',
            'CREATE VIEW v_audit AS SELECT id FROM audit;',
        ].join('\n');
        const definitions = extractor.extractDefinitions(sql, '/sql/migration.sql', 'MySQL');
        expect(definitions.map(definition => definition.name)).toEqual(['src', 'v_audit']);
        expect(definitions[1]).toEqual(expect.objectContaining({
            lineNumber: 5,
            sql: expect.stringMatching(/^CREATE VIEW v_audit AS/),
        }));
    });

    it('finds a definition after a MySQL comment containing a glob path', () => {
        const sql = 'CREATE TABLE a (id INT); /* /backups/*.sql */ CREATE VIEW b AS SELECT id FROM a;';
        expect(extractor.extractDefinitions(sql, '/sql/migration.sql', 'MySQL')
            .map(definition => definition.name)).toEqual(['a', 'b']);
    });

    it('parses large files one statement at a time instead of using the quadratic batch path', () => {
        const astifySpy = jest.spyOn((extractor as any).parser, 'astify');
        const sql = Array.from({ length: 200 }, (_, index) =>
            `CREATE TABLE table_${index} (id INT);`
        ).join('\n');

        const definitions = extractor.extractDefinitions(sql, '/sql/large.sql', 'MySQL');

        expect(definitions).toHaveLength(200);
        expect(astifySpy).toHaveBeenCalledTimes(200);
        expect(Math.max(...astifySpy.mock.calls.map(call => String(call[0]).length))).toBeLessThan(80);
    });

    it('scans CREATE headers once per file instead of once per definition', () => {
        const headerRegexSpy = jest.spyOn(extractor as any, 'createHeaderRegex');
        const sql = Array.from({ length: 200 }, (_, index) =>
            index % 2 === 0
                ? `CREATE TABLE s.table_${index} (\n  id INT\n);`
                : `CREATE VIEW view_${index} AS\nSELECT id FROM s.table_${index - 1};`
        ).join('\n');

        const definitions = extractor.extractDefinitions(sql, '/sql/schema.sql', 'MySQL');

        expect(definitions).toHaveLength(200);
        expect(definitions[198]).toEqual(expect.objectContaining({
            type: 'table', name: 'table_198', schema: 's', statementIndex: 198, lineNumber: 496,
        }));
        expect(definitions[199]).toEqual(expect.objectContaining({
            type: 'view', name: 'view_199', statementIndex: 199, lineNumber: 499,
        }));
        // Whole-file header scans happen once per (type, text) view. The only
        // per-definition regex is the quote-flag probe over that definition's
        // own SQL; the old lookups built ~5 whole-file regexes per definition.
        expect(headerRegexSpy.mock.calls.length).toBeLessThan(definitions.length / 2 + 20);
    });

    it('extracts thousands of definitions from one file in linear time', () => {
        const sql = Array.from({ length: 2000 }, (_, index) =>
            `CREATE TABLE t${index} (\n  id INT,\n  name VARCHAR(10)\n);`
        ).join('\n');

        const start = Date.now();
        const definitions = extractor.extractDefinitions(sql, '/sql/dump.sql', 'MySQL');
        const elapsed = Date.now() - start;

        expect(definitions).toHaveLength(2000);
        expect(definitions[1999]).toEqual(expect.objectContaining({ name: 't1999', lineNumber: 7997 }));
        // Previously ~18 s (cubic prefix rescans); now well under a second.
        expect(elapsed).toBeLessThan(5000);
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

        it('reports and recovers through fallback when AST definition processing fails', () => {
            jest.spyOn(extractor as any, 'extractColumns').mockImplementationOnce(() => {
                throw new Error('unexpected AST shape');
            });

            const result = extractor.extractDefinitionsWithStatus(
                'CREATE TABLE orders (id INT);',
                '/sql/orders.sql',
                'MySQL'
            );

            expect(result.definitions).toEqual([
                expect.objectContaining({ name: 'orders', type: 'table' }),
            ]);
            expect(result.warnings).toEqual([
                expect.stringContaining('CREATE TABLE extraction failed: unexpected AST shape'),
            ]);
        });

        it('extracts schema-qualified CREATE TABLE', () => {
            const sql = 'CREATE TABLE public.users (id INT, name VARCHAR(100));';
            const defs = extractor.extractDefinitions(sql, '/sql/users.sql', 'PostgreSQL');

            expect(defs).toHaveLength(1);
            expect(defs[0].name).toBe('users');
            expect(defs[0].schema).toBe('public');
        });

        it('preserves catalog, schema, and quoting for three-part SQL Server names', () => {
            const defs = extractor.extractDefinitions(
                'CREATE TABLE [warehouse].[sales].[orders] (id INT);',
                '/sql/orders.sql',
                'TransactSQL'
            );

            expect(defs).toEqual([
                expect.objectContaining({
                    catalog: 'warehouse',
                    schema: 'sales',
                    name: 'orders',
                    catalogQuoted: true,
                    schemaQuoted: true,
                    nameQuoted: true,
                }),
            ]);
        });

        it('preserves SQL Server database qualification when the schema is omitted', () => {
            const defs = extractor.extractDefinitions(
                'CREATE TABLE reporting..orders (id INT);',
                '/sql/orders.sql',
                'TransactSQL'
            );

            expect(defs).toEqual([
                expect.objectContaining({
                    catalog: 'reporting',
                    schema: undefined,
                    name: 'orders',
                    columns: expect.arrayContaining([expect.objectContaining({ name: 'id' })]),
                }),
            ]);
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

        it('extracts inline foreign-key metadata from the AST path', () => {
            const defs = extractor.extractDefinitions(
                'CREATE TABLE child (id INT, parent_id INT REFERENCES public.parent(id));',
                '/sql/child.sql',
                'PostgreSQL'
            );

            expect(defs[0].columns.find(column => column.name === 'parent_id')?.foreignKey).toEqual({
                referencedTable: 'public.parent',
                referencedColumn: 'id',
            });
        });

        it('applies table-level composite foreign keys to their local columns', () => {
            const defs = extractor.extractDefinitions(
                'CREATE TABLE child (parent_id INT, parent_tenant INT, CONSTRAINT fk_parent FOREIGN KEY (parent_id, parent_tenant) REFERENCES parent(id, tenant_id));',
                '/sql/child.sql',
                'PostgreSQL'
            );

            expect(defs[0].columns.find(column => column.name === 'parent_id')?.foreignKey).toEqual({
                referencedTable: 'parent',
                referencedColumn: 'id',
            });
            expect(defs[0].columns.find(column => column.name === 'parent_tenant')?.foreignKey).toEqual({
                referencedTable: 'parent',
                referencedColumn: 'tenant_id',
            });
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

        it.each([
            ['TransactSQL' as const, 'SELECT id INTO dbo.report FROM dbo.source_table;', 'dbo', 'report'],
            ['PostgreSQL' as const, 'SELECT id INTO TEMP report FROM source_table;', undefined, 'report'],
        ])('extracts SELECT INTO output definitions for %s', (dialect, sql, schema, name) => {
            const defs = extractor.extractDefinitions(sql, '/sql/select-into.sql', dialect);

            expect(defs).toEqual([
                expect.objectContaining({
                    type: 'table',
                    name,
                    schema,
                    statementIndex: 0,
                    sql,
                }),
            ]);
        });

        it('does not treat MySQL SELECT INTO variable syntax as a table definition', () => {
            const defs = extractor.extractDefinitions(
                'SELECT id INTO report FROM source_table;',
                '/sql/select-into-variable.sql',
                'MySQL'
            );

            expect(defs).toEqual([]);
        });

        it('preserves quotedness metadata for definitions and SELECT INTO targets', () => {
            const defs = extractor.extractDefinitions(
                'CREATE TABLE "Sales"."Orders" (id INT);\n'
                    + 'SELECT id INTO "Sales"."select" FROM source_table;',
                '/sql/quoted-definitions.sql',
                'PostgreSQL'
            );

            expect(defs).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    name: 'Orders',
                    schema: 'Sales',
                    nameQuoted: true,
                    schemaQuoted: true,
                }),
                expect.objectContaining({
                    name: 'select',
                    schema: 'Sales',
                    nameQuoted: true,
                    schemaQuoted: true,
                    statementIndex: 1,
                }),
            ]));
        });

        it('preserves three-part SELECT INTO target qualifiers', () => {
            const defs = extractor.extractDefinitions(
                'SELECT id INTO [warehouse].[sales].[report] FROM [warehouse].[raw].[source_table];',
                '/sql/select-into.sql',
                'TransactSQL'
            );

            expect(defs).toEqual([
                expect.objectContaining({
                    catalog: 'warehouse',
                    schema: 'sales',
                    name: 'report',
                    catalogQuoted: true,
                    schemaQuoted: true,
                    nameQuoted: true,
                }),
            ]);
        });

        it('does not treat SELECT INTO OUTFILE as a table definition', () => {
            const defs = extractor.extractDefinitions(
                "SELECT id INTO OUTFILE '/tmp/export.csv' FROM source_table;",
                '/sql/export.sql',
                'MySQL'
            );

            expect(defs).toEqual([]);
        });

        it('does not treat procedural SELECT INTO inside a dollar-quoted body as table creation', () => {
            const sql = [
                'CREATE FUNCTION f() RETURNS void AS $$',
                'BEGIN',
                '  SELECT id INTO selected_id FROM users;',
                'END;',
                '$$ LANGUAGE plpgsql;',
            ].join('\n');

            const defs = extractor.extractDefinitions(sql, '/sql/function.sql', 'PostgreSQL');

            expect(defs).toEqual([]);
        });

        it('does not treat a T-SQL SELECT INTO variable as a table definition', () => {
            const defs = extractor.extractDefinitions(
                'SELECT COUNT(*) INTO @row_count FROM dbo.users;',
                '/sql/select-into-variable.sql',
                'TransactSQL'
            );

            expect(defs).toEqual([]);
        });

        it('retains a quoted T-SQL table whose name starts with an at sign', () => {
            const defs = extractor.extractDefinitions(
                'SELECT id INTO [@audit_table] FROM dbo.users;',
                '/sql/select-into-quoted-at-table.sql',
                'TransactSQL'
            );

            expect(defs).toEqual([
                expect.objectContaining({ name: '@audit_table', nameQuoted: true }),
            ]);
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

    describe('regex fallback statement indexes', () => {
        it('assigns statementIndex to definitions from the regex fallback path', () => {
            const extractor = new SchemaExtractor();
            // CREATE PROCEDURE makes the AST parse fail, forcing the regex path.
            const { definitions, warnings } = extractor.extractDefinitionsWithStatus(
                [
                    'CREATE PROCEDURE p() BEGIN SELECT 1; END;',
                    'CREATE TABLE t_a (id INT);',
                    'CREATE TABLE t_b AS SELECT id FROM t_a;',
                    'CREATE VIEW v_c AS SELECT id FROM t_b;',
                ].join('\n'),
                '/fallback.sql',
                'MySQL'
            );

            expect(warnings.length).toBeGreaterThan(0);
            for (const definition of definitions) {
                expect(typeof definition.statementIndex).toBe('number');
            }
            const byName = new Map(definitions.map(d => [d.name, d.statementIndex]));
            expect(byName.get('t_b')).toBe((byName.get('t_a') as number) + 1);
            expect(byName.get('v_c')).toBe((byName.get('t_b') as number) + 1);
        });

        it('ignores semicolons inside quoted identifiers when indexing statements', () => {
            const extractor = new SchemaExtractor();
            const { definitions } = extractor.extractDefinitionsWithStatus(
                [
                    'CREATE PROCEDURE p() BEGIN SELECT 1; END;',
                    'CREATE TABLE "we;ird" (id INT);',
                    'CREATE TABLE after_it (id INT);',
                ].join('\n'),
                '/quoted.sql',
                'PostgreSQL'
            );

            const byName = new Map(definitions.map(d => [d.name, d.statementIndex]));
            expect(byName.get('after_it')).toBe((byName.get('we;ird') as number) + 1);
        });
    });
});

describe('SchemaExtractor definition identity and location', () => {
    const extract = (sql: string, dialect: Parameters<SchemaExtractor['extractDefinitions']>[2]) =>
        new SchemaExtractor().extractDefinitionsWithStatus(sql, '/sql/defs.sql', dialect).definitions;

    it('keeps quoted view and CTAS names instead of capturing the AS keyword', () => {
        const [mysqlView] = extract('CREATE VIEW `active_users` AS SELECT id FROM users;', 'MySQL');
        expect(mysqlView).toEqual(expect.objectContaining({ type: 'view', name: 'active_users', nameQuoted: true }));

        const pg = extract([
            'CREATE VIEW "ActiveUsers" AS SELECT id FROM users;',
            'CREATE TABLE "daily_totals" AS SELECT 1 AS n;',
            'CREATE VIEW analytics."Revenue" AS SELECT 1 AS n;',
        ].join('\n'), 'PostgreSQL');
        expect(pg.map(d => [d.type, d.schema, d.name, d.lineNumber])).toEqual([
            ['view', undefined, 'ActiveUsers', 1],
            ['table', undefined, 'daily_totals', 2],
            ['view', 'analytics', 'Revenue', 3],
        ]);
        expect(pg[1].sql).toBe('CREATE TABLE "daily_totals" AS SELECT 1 AS n;');
    });

    it('keeps distinct BigQuery backtick views as separate definitions', () => {
        const defs = extract([
            'CREATE VIEW `proj.ds.v1` AS SELECT 1 AS a;',
            'CREATE VIEW `proj.ds.v2` AS SELECT 2 AS b;',
        ].join('\n'), 'BigQuery');
        expect(defs.map(d => d.name)).toEqual(['proj.ds.v1', 'proj.ds.v2']);
    });

    it('locates same-name definitions in different schemas at their own statement', () => {
        const sql = [
            'CREATE TABLE staging.orders (id INT);',               // 1
            '',                                                    // 2
            'CREATE TABLE mart.orders AS SELECT id FROM raw_orders;', // 3
        ].join('\n');

        const defs = extract(sql, 'PostgreSQL');

        expect(defs.map(d => [d.schema, d.name, d.statementIndex, d.lineNumber])).toEqual([
            ['staging', 'orders', 0, 1],
            ['mart', 'orders', 1, 3],
        ]);
        expect(defs[1].sql).toBe('CREATE TABLE mart.orders AS SELECT id FROM raw_orders;');
    });

    it('locates same-name definitions at their own statement on the regex fallback path', () => {
        // The unterminated CASE forces the AST parser to fail for this file.
        const sql = [
            'CREATE TABLE staging.orders (id INT);',
            'SELECT CASE WHEN FROM;',
            'CREATE TABLE mart.orders (id INT, total INT);',
        ].join('\n');

        const { definitions, warnings } = new SchemaExtractor()
            .extractDefinitionsWithStatus(sql, '/sql/defs.sql', 'PostgreSQL');

        expect(warnings.length).toBeGreaterThan(0);
        expect(definitions.map(d => [d.schema, d.name, d.lineNumber, d.columns.length])).toEqual([
            ['staging', 'orders', 1, 1],
            ['mart', 'orders', 3, 2],
        ]);
        expect(definitions[1].sql).toContain('mart.orders');
    });
});
