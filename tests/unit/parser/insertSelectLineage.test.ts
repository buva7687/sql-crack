/**
 * Item #6: INSERT INTO ... SELECT Lineage
 * 
 * Tests for verifying that INSERT...SELECT statements render correctly
 * with write target shown distinctly.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #6: INSERT INTO ... SELECT Lineage', () => {
    const assertInsertWriteFlow = (
        result: any,
        targetPredicate?: (label: string) => boolean
    ) => {
        expect(result.error).toBeUndefined();

        const insertResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'INSERT');
        expect(insertResult).toBeDefined();

        const targetTable = result.nodes.find((n: any) => {
            if (n.type !== 'table' || n.accessMode !== 'write' || n.operationType !== 'INSERT') {
                return false;
            }
            return targetPredicate ? targetPredicate(String(n.label || '')) : true;
        });
        expect(targetTable).toBeDefined();

        expect(result.edges.some((e: any) => e.source === targetTable?.id && e.target === insertResult?.id)).toBe(true);
        expect(result.edges.some((e: any) => e.target === targetTable?.id && e.source !== targetTable?.id)).toBe(true);

        return { insertResult, targetTable };
    };

    describe('Flow wiring', () => {
        it('should preserve inner SELECT flow and connect it to insert target and insert result', () => {
            const sql = `
                INSERT INTO daily_sales_summary (report_date, total_orders, total_revenue)
                SELECT DATE(order_date), COUNT(*), SUM(amount)
                FROM orders
                GROUP BY DATE(order_date)
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();

            const insertResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'INSERT');
            const selectResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'Result');
            const sourceTable = result.nodes.find((n: any) => n.type === 'table' && n.label?.toLowerCase() === 'orders' && n.accessMode !== 'write');
            const targetTable = result.nodes.find((n: any) => n.type === 'table' && n.label?.toLowerCase().includes('daily_sales_summary') && n.accessMode === 'write');

            expect(insertResult).toBeDefined();
            expect(selectResult).toBeDefined();
            expect(sourceTable).toBeDefined();
            expect(targetTable).toBeDefined();
            expect(targetTable?.operationType).toBe('INSERT');
            expect(result.nodes.some((n: any) => n.type === 'aggregate')).toBe(true);

            expect(result.edges.some((e: any) => e.source === sourceTable?.id)).toBe(true);
            expect(result.edges.some((e: any) => e.source === selectResult?.id && e.target === targetTable?.id)).toBe(true);
            expect(result.edges.some((e: any) => e.source === targetTable?.id && e.target === insertResult?.id)).toBe(true);
        });

        it('should keep plain INSERT ... VALUES on the simple write path', () => {
            const sql = `
                INSERT INTO audit_log (id, message)
                VALUES (1, 'ok')
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();

            const tables = result.nodes.filter((n: any) => n.type === 'table');
            const insertResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'INSERT');
            const selectResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'Result');

            expect(tables).toHaveLength(1);
            expect(tables[0].accessMode).toBe('write');
            expect(tables[0].operationType).toBe('INSERT');
            expect(insertResult).toBeDefined();
            expect(selectResult).toBeUndefined();
        });
    });

    describe('Basic INSERT...SELECT', () => {
        it('should render target table with write access mode', () => {
            const sql = `
                INSERT INTO daily_sales_summary (report_date, total_orders, total_revenue)
                SELECT DATE(order_date), COUNT(*), SUM(amount)
                FROM orders
                GROUP BY DATE(order_date)
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const { targetTable } = assertInsertWriteFlow(
                result,
                label => label.toLowerCase().includes('daily_sales_summary')
            );
            expect(targetTable?.operationType).toBe('INSERT');
        });

        it('should handle simple INSERT...SELECT', () => {
            const sql = `
                INSERT INTO customer_summary (customer_id, total_orders)
                SELECT customer_id, COUNT(*)
                FROM orders
                GROUP BY customer_id
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('customer_summary'));
        });
    });

    describe('Column Mapping and Transformations', () => {
        it('should handle explicit column lists', () => {
            const sql = `
                INSERT INTO customer_feedback (customer_id, rating, category)
                SELECT r.customer_id, r.rating, 'Positive'
                FROM reviews r
                WHERE r.rating >= 4
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('customer_feedback'));
        });

        it('should handle CASE transformations in SELECT', () => {
            const sql = `
                INSERT INTO customer_feedback (customer_id, rating, category)
                SELECT
                    r.customer_id,
                    r.rating,
                    CASE
                        WHEN r.rating >= 4 THEN 'Positive'
                        WHEN r.rating >= 3 THEN 'Neutral'
                        ELSE 'Negative'
                    END AS category
                FROM reviews r
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const { targetTable } = assertInsertWriteFlow(result, label => label.toLowerCase().includes('customer_feedback'));
            expect(targetTable?.operationType).toBe('INSERT');
        });

        it('should handle functions in column expressions', () => {
            const sql = `
                INSERT INTO daily_sales (report_date, total_orders, total_revenue)
                SELECT CURRENT_DATE, COUNT(*), COALESCE(SUM(amount), 0)
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('daily_sales'));
        });
    });

    describe('INSERT...SELECT with Aggregates and Joins', () => {
        it('should handle aggregates in INSERT...SELECT', () => {
            const sql = `
                INSERT INTO metrics (metric_date, total_sales, avg_order_value)
                SELECT DATE(order_date), SUM(amount), AVG(amount)
                FROM orders
                GROUP BY DATE(order_date)
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const { targetTable } = assertInsertWriteFlow(result, label => label.toLowerCase().includes('metrics'));
            expect(targetTable?.accessMode).toBe('write');
        });

        it('should handle JOINs in INSERT...SELECT', () => {
            const sql = `
                INSERT INTO customer_orders (customer_id, order_id, total_amount)
                SELECT c.customer_id, o.order_id, o.total_amount
                FROM customers c
                JOIN orders o ON c.customer_id = o.customer_id
                WHERE o.status = 'completed'
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('customer_orders'));
        });

        it('should handle subqueries in WHERE clause', () => {
            const sql = `
                INSERT INTO high_value_orders (order_id, customer_name, total_amount)
                SELECT o.order_id, c.customer_name, o.total_amount
                FROM orders o
                WHERE o.customer_id IN (
                    SELECT customer_id FROM customers WHERE tier = 'Platinum'
                )
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('high_value_orders'));
        });
    });

    describe('INSERT...SELECT with CTEs', () => {
        it('should render CTEs when using INSERT ... WITH ... SELECT', () => {
            const sql = `
                INSERT INTO vip_customers (customer_id, total_spent)
                WITH customer_totals AS (
                    SELECT customer_id, SUM(amount) AS total_spent
                    FROM orders
                    WHERE status = 'completed'
                    GROUP BY customer_id
                )
                SELECT customer_id, total_spent
                FROM customer_totals
                WHERE total_spent > 10000
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const { targetTable } = assertInsertWriteFlow(result, label => label.toLowerCase().includes('vip_customers'));
            const cteNode = result.nodes.find((n: any) => n.type === 'cte' && n.label?.toLowerCase().includes('customer_totals'));
            const selectResult = result.nodes.find((n: any) => n.type === 'result' && n.label === 'Result');

            expect(cteNode).toBeDefined();
            expect(selectResult).toBeDefined();
            expect(result.edges.some((e: any) => e.source === selectResult?.id && e.target === targetTable?.id)).toBe(true);
        });
    });

    describe('Different SQL Dialects', () => {
        it('should handle MySQL INSERT...SELECT', () => {
            const sql = `
                INSERT INTO summary_table (date_col, count_col)
                SELECT DATE(order_date), COUNT(*)
                FROM orders
                GROUP BY DATE(order_date)
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('summary_table'));
        });

        it('should handle BigQuery INSERT...SELECT', () => {
            const sql = `
                INSERT INTO project.dataset.summary (report_date, metric_value)
                SELECT CURRENT_DATE(), COUNT(*)
                FROM project.dataset.orders
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('summary'));
        });

        it('should handle TransactSQL INSERT...SELECT', () => {
            const sql = `
                INSERT INTO dbo.CustomerSummary (CustomerID, TotalOrders, TotalAmount)
                SELECT c.CustomerID, COUNT(o.OrderID), SUM(o.TotalAmount)
                FROM Customers c
                JOIN Orders o ON c.CustomerID = o.CustomerID
                GROUP BY c.CustomerID
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('customersummary'));
        });
    });

    describe('Edge Cases', () => {
        it('should handle INSERT...SELECT *', () => {
            const sql = `
                INSERT INTO orders_archive
                SELECT * FROM orders WHERE order_date < '2024-01-01'
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('orders_archive'));
        });

        it('should handle INSERT...SELECT DISTINCT', () => {
            const sql = `
                INSERT INTO unique_customers (customer_id)
                SELECT DISTINCT customer_id FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('unique_customers'));
        });

        it('should handle INSERT...SELECT with LIMIT', () => {
            const sql = `
                INSERT INTO top_orders (order_id, customer_id, amount)
                SELECT order_id, customer_id, amount
                FROM orders
                ORDER BY amount DESC
                LIMIT 100
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('top_orders'));
        });
    });

    describe('Verification Tests', () => {
        it('should correctly mark write target with distinct properties', () => {
            const sql = `
                INSERT INTO targets (id, value)
                SELECT id, value FROM source
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const { targetTable } = assertInsertWriteFlow(result, label => label.toLowerCase().includes('target'));
            expect(targetTable?.accessMode).toBe('write');
            expect(targetTable?.operationType).toBe('INSERT');
        });

        it('should parse INSERT...SELECT without errors', () => {
            const sql = `
                INSERT INTO archive (id, created_at, data)
                SELECT id, NOW(), data
                FROM active_records
                WHERE is_processed = false
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            assertInsertWriteFlow(result, label => label.toLowerCase().includes('archive'));
        });
    });
});
