import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('DML write source flow visualization (phase 4.2 tier 1)', () => {
    it('renders UPDATE ... FROM source flow with join context into write target', () => {
        const sql = `
            UPDATE customer_summary cs
            SET total_orders = src.total_orders
            FROM (
                SELECT c.customer_id, COUNT(o.id) AS total_orders
                FROM customers c
                JOIN orders o ON o.customer_id = c.customer_id
                GROUP BY c.customer_id
            ) src
            WHERE cs.customer_id = src.customer_id
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(result.error).toBeUndefined();

        const updateResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPDATE');
        const target = result.nodes.find((n: any) =>
            n.type === 'table' &&
            n.accessMode === 'write' &&
            n.operationType === 'UPDATE' &&
            n.label?.toLowerCase().includes('customer_summary')
        );
        const hasNestedJoin = result.nodes.some((n: any) =>
            n.type === 'subquery' &&
            Array.isArray(n.children) &&
            n.children.some((child: any) => child.type === 'join')
        );

        expect(updateResult).toBeDefined();
        expect(target).toBeDefined();
        expect(hasNestedJoin).toBe(true);
        expect(result.edges.some((e: any) => e.target === target?.id && e.source !== target?.id)).toBe(true);
        expect(result.edges.some((e: any) => e.source === target?.id && e.target === updateResult?.id)).toBe(true);
    });

    it('renders UPDATE ... WHERE IN (SELECT ...) with where filter bridge', () => {
        const sql = `
            UPDATE customers
            SET tier = 'VIP'
            WHERE customer_id IN (
                SELECT customer_id
                FROM orders
                WHERE total_amount > 1000
            )
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(result.error).toBeUndefined();

        const target = result.nodes.find((n: any) =>
            n.type === 'table' &&
            n.accessMode === 'write' &&
            n.operationType === 'UPDATE' &&
            n.label?.toLowerCase() === 'customers'
        );
        const sourceTable = result.nodes.find((n: any) =>
            n.type === 'table' &&
            !n.accessMode &&
            n.label?.toLowerCase() === 'orders'
        );
        const hasFilterIntoTarget = result.edges.some((e: any) => {
            if (e.target !== target?.id) { return false; }
            const sourceNode = result.nodes.find((n: any) => n.id === e.source);
            return sourceNode?.type === 'filter' && sourceNode?.label === 'WHERE';
        });

        expect(target).toBeDefined();
        expect(sourceTable).toBeDefined();
        expect(hasFilterIntoTarget).toBe(true);
    });

    it('renders DELETE ... WHERE IN (SELECT ...) source flow before delete target', () => {
        const sql = `
            DELETE FROM orders
            WHERE customer_id IN (
                SELECT id FROM blacklisted_customers
            )
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(result.error).toBeUndefined();

        const deleteResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'DELETE');
        const target = result.nodes.find((n: any) =>
            n.type === 'table' &&
            n.accessMode === 'write' &&
            n.operationType === 'DELETE' &&
            n.label?.toLowerCase() === 'orders'
        );
        const sourceTable = result.nodes.find((n: any) =>
            n.type === 'table' &&
            !n.accessMode &&
            n.label?.toLowerCase() === 'blacklisted_customers'
        );
        const hasFilterIntoTarget = result.edges.some((e: any) => {
            if (e.target !== target?.id) { return false; }
            const sourceNode = result.nodes.find((n: any) => n.id === e.source);
            return sourceNode?.type === 'filter' && sourceNode?.label === 'WHERE';
        });

        expect(deleteResult).toBeDefined();
        expect(target).toBeDefined();
        expect(sourceTable).toBeDefined();
        expect(hasFilterIntoTarget).toBe(true);
        expect(result.edges.some((e: any) => e.source === target?.id && e.target === deleteResult?.id)).toBe(true);
    });

    it('renders DELETE ... WHERE EXISTS (SELECT ...) source flow before delete target', () => {
        const sql = `
            DELETE FROM orders o
            WHERE EXISTS (
                SELECT 1
                FROM returns r
                WHERE r.order_id = o.id
            )
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(result.error).toBeUndefined();

        const target = result.nodes.find((n: any) =>
            n.type === 'table' &&
            n.accessMode === 'write' &&
            n.operationType === 'DELETE' &&
            n.label?.toLowerCase() === 'orders'
        );
        const sourceTable = result.nodes.find((n: any) =>
            n.type === 'table' &&
            !n.accessMode &&
            n.label?.toLowerCase() === 'returns'
        );
        const hasFilterIntoTarget = result.edges.some((e: any) => {
            if (e.target !== target?.id) { return false; }
            const sourceNode = result.nodes.find((n: any) => n.id === e.source);
            return sourceNode?.type === 'filter' && sourceNode?.label === 'WHERE';
        });

        expect(target).toBeDefined();
        expect(sourceTable).toBeDefined();
        expect(hasFilterIntoTarget).toBe(true);
    });

    it('renders UPDATE ... FROM self-join without filtering out the source', () => {
        const sql = `
            UPDATE employees e
            SET salary = e2.salary
            FROM employees e2
            WHERE e.manager_id = e2.id
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(result.error).toBeUndefined();

        const target = result.nodes.find((n: any) =>
            n.type === 'table' &&
            n.accessMode === 'write' &&
            n.operationType === 'UPDATE' &&
            n.label?.toLowerCase() === 'employees'
        );
        const sourceTable = result.nodes.find((n: any) =>
            n.type === 'table' &&
            !n.accessMode &&
            n.label?.toLowerCase() === 'employees'
        );

        expect(target).toBeDefined();
        expect(sourceTable).toBeDefined();
        expect(result.edges.some((e: any) => e.source === target?.id)).toBe(true);
    });
});
