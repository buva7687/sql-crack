import { parseSql, parseSqlBatch } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('DDL visualization', () => {
    it('renders CREATE TABLE with foreign-key reference flow and details', () => {
        const sql = `
            CREATE TABLE orders (
                id INT PRIMARY KEY,
                customer_id INT REFERENCES customers(id),
                created_at DATETIME
            )
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const targetTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'CREATE_TABLE'
        );
        const referencedTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'customers'
            && node.accessMode === 'read'
        );
        const createNode = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'CREATE TABLE orders'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(targetTable).toBeDefined();
        expect(referencedTable).toBeDefined();
        expect(createNode?.details).toContain('Definitions: 3');
        expect(createNode?.details?.some((detail: string) => detail.includes('customer_id INT REFERENCES customers(id)'))).toBe(true);
        expect(result.edges.some((edge: any) => edge.source === referencedTable?.id && edge.target === targetTable?.id && edge.sqlClause === 'REFERENCES')).toBe(true);
    });

    it('renders ALTER TABLE column actions and referenced tables', () => {
        const sql = `
            ALTER TABLE orders
            ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
            ADD COLUMN archived_at DATETIME,
            DROP COLUMN legacy_flag
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const targetTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'ALTER'
        );
        const alterNode = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'ALTER TABLE orders'
        );
        const referencedTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'customers'
            && node.accessMode === 'read'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(targetTable).toBeDefined();
        expect(referencedTable).toBeDefined();
        expect(alterNode?.details).toEqual(expect.arrayContaining([
            expect.stringContaining('ADD fk_customer: FOREIGN KEY'),
            'ADD COLUMN archived_at DATETIME',
            'DROP COLUMN legacy_flag',
        ]));
        expect(result.edges.some((edge: any) => edge.source === referencedTable?.id && edge.target === targetTable?.id && edge.sqlClause === 'REFERENCES')).toBe(true);
    });

    it('renders DROP TABLE with multiple targets', () => {
        const sql = 'DROP TABLE IF EXISTS orders, order_items';
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const orderTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DROP'
        );
        const orderItemsTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'order_items'
            && node.accessMode === 'write'
            && node.operationType === 'DROP'
        );
        const dropNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'DROP TABLE (2)');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(orderTarget).toBeDefined();
        expect(orderItemsTarget).toBeDefined();
        expect(dropNode?.details).toContain('IF EXISTS');
    });

    it('renders DROP INDEX with parent-table detail', () => {
        const sql = 'DROP INDEX idx_orders ON dbo.orders';
        const result = parseSql(sql, 'TransactSQL' as SqlDialect);

        const indexTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'idx_orders'
            && node.accessMode === 'write'
            && node.operationType === 'DROP'
        );
        const dropNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'DROP INDEX idx_orders');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(indexTarget).toBeDefined();
        expect(dropNode?.details).toContain('ON dbo.orders');
    });

    it('renders TRUNCATE TABLE options', () => {
        const sql = 'TRUNCATE TABLE orders RESTART IDENTITY CASCADE';
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const targetTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'TRUNCATE'
        );
        const truncateNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'TRUNCATE TABLE orders');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(targetTable).toBeDefined();
        expect(truncateNode?.details).toContain('Options: RESTART IDENTITY, CASCADE');
    });

    it('keeps CTAS on the select-aware path via query_expr', () => {
        const sql = 'CREATE TABLE archived_orders AS SELECT * FROM orders';
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode !== 'write'
        );
        const resultNode = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'TABLE archived_orders'
            && node.operationType === 'CREATE_TABLE_AS'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(resultNode).toBeDefined();
    });

    it('includes TRUNCATE in merged DDL batches', () => {
        const sql = `
            CREATE TABLE orders (id INT);
            ALTER TABLE orders ADD COLUMN archived_at DATETIME;
            TRUNCATE TABLE orders;
        `;
        const batch = parseSqlBatch(sql, 'MySQL' as SqlDialect, undefined, { combineDdlStatements: true });

        expect(batch.queries).toHaveLength(1);
        expect(batch.queries[0].nodes[0]?.label).toBe('Schema Changes');
        expect(batch.queries[0].hints[0]?.suggestion).toMatch(/3 DDL statements/i);
        expect(batch.queries[0].hints[0]?.message).toContain('TRUNCATE TABLE');
    });
});
