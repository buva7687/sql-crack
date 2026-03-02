import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('DELETE join and USING visualization', () => {
    it('renders PostgreSQL DELETE ... USING via compatibility parser', () => {
        const sql = `
            DELETE FROM orders o
            USING customers c
            WHERE o.customer_id = c.id
              AND c.status = 'inactive'
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'customers' && !node.accessMode);
        const targetTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );
        const filterNode = result.nodes.find((node: any) => node.type === 'filter' && node.label === 'WHERE');
        const hint = result.hints.find((hint: any) => hint.message?.includes('DELETE ... USING'));

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(targetTable).toBeDefined();
        expect(filterNode?.details?.[0]).toContain('c.status');
        expect(hint?.suggestion).toMatch(/compatibility parser/i);
        expect(result.edges.some((edge: any) => edge.target === targetTable?.id)).toBe(true);
    });

    it('renders PostgreSQL DELETE ... USING with subquery sources', () => {
        const sql = `
            DELETE FROM orders o
            USING (
                SELECT customer_id
                FROM customers
                WHERE status = 'inactive'
            ) inactive_customers
            WHERE o.customer_id = inactive_customers.customer_id
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const nestedCustomerSource = result.nodes.some((node: any) =>
            node.type === 'subquery'
            && Array.isArray(node.children)
            && node.children.some((child: any) => child.type === 'table' && child.label === 'customers')
        );
        const targetTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(nestedCustomerSource).toBe(true);
        expect(targetTable).toBeDefined();
        expect(result.edges.some((edge: any) => edge.target === targetTable?.id)).toBe(true);
    });

    it('renders MySQL joined DELETE with actual target table name', () => {
        const sql = `
            DELETE o
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE c.status = 'inactive'
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const writeTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );
        const readTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode !== 'write'
        );
        const sourceCustomer = result.nodes.find((node: any) => node.type === 'table' && node.label === 'customers' && !node.accessMode);
        const joinNode = result.nodes.find((node: any) => node.type === 'join');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(writeTarget).toBeDefined();
        expect(readTarget).toBeUndefined();
        expect(sourceCustomer).toBeDefined();
        expect(joinNode).toBeDefined();
        expect(result.nodes.some((node: any) => node.type === 'table' && node.label === 'o' && node.accessMode === 'write')).toBe(false);
    });

    it('renders MySQL multi-table DELETE with both actual target tables', () => {
        const sql = `
            DELETE o, c
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE c.status = 'inactive'
        `;
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const orderTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );
        const customerTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'customers'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(orderTarget).toBeDefined();
        expect(customerTarget).toBeDefined();
    });

    it('renders MariaDB joined DELETE with actual target table name', () => {
        const sql = `
            DELETE o
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE c.status = 'inactive'
        `;
        const result = parseSql(sql, 'MariaDB' as SqlDialect);

        const writeTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(writeTarget).toBeDefined();
        expect(result.nodes.some((node: any) => node.type === 'table' && node.label === 'o' && node.accessMode === 'write')).toBe(false);
    });

    it('renders TransactSQL joined DELETE with actual target table name', () => {
        const sql = `
            DELETE o
            FROM orders o
            INNER JOIN customers c ON o.customer_id = c.id
            WHERE c.status = 'inactive'
        `;
        const result = parseSql(sql, 'TransactSQL' as SqlDialect);

        const writeTarget = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );
        const sourceCustomer = result.nodes.find((node: any) => node.type === 'table' && node.label === 'customers' && !node.accessMode);

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(writeTarget).toBeDefined();
        expect(sourceCustomer).toBeDefined();
        expect(result.nodes.some((node: any) => node.type === 'table' && node.label === 'o' && node.accessMode === 'write')).toBe(false);
    });

    it('annotates PostgreSQL DELETE ... RETURNING columns on the result node', () => {
        const sql = `
            DELETE FROM orders
            WHERE status = 'inactive'
            RETURNING id, customer_id
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const deleteNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'DELETE');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(deleteNode).toBeDefined();
        expect(deleteNode?.description).toContain('RETURNING: id, customer_id');
    });

    it('parses TransactSQL DELETE ... OUTPUT and keeps output columns on the result node', () => {
        const sql = `
            DELETE FROM orders
            OUTPUT DELETED.id, DELETED.customer_id
            WHERE status = 'inactive'
        `;
        const result = parseSql(sql, 'TransactSQL' as SqlDialect);

        const targetTable = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'write'
            && node.operationType === 'DELETE'
        );
        const deleteNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'DELETE');
        const hint = result.hints.find((entry: any) => entry.message?.includes('DELETE ... OUTPUT'));

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(targetTable).toBeDefined();
        expect(deleteNode?.description).toContain('OUTPUT: id, customer_id');
        expect(hint).toBeDefined();
    });

    it('parses TransactSQL joined DELETE ... OUTPUT INTO with output sink', () => {
        const sql = `
            DELETE o
            OUTPUT DELETED.id, DELETED.customer_id INTO deleted_order_log
            FROM orders o
            INNER JOIN customers c ON o.customer_id = c.id
            WHERE c.status = 'inactive'
        `;
        const result = parseSql(sql, 'TransactSQL' as SqlDialect);

        const deleteNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'DELETE');
        const outputSink = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'deleted_order_log'
            && node.accessMode === 'write'
            && node.operationType === 'INSERT'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(deleteNode?.description).toContain('OUTPUT: id, customer_id');
        expect(outputSink).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === deleteNode?.id && edge.target === outputSink?.id)).toBe(true);
    });
});
