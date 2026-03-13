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
    });
});
