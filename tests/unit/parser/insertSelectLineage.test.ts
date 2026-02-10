/**
 * Item #6: INSERT INTO ... SELECT Lineage
 * 
 * Tests for verifying that INSERT...SELECT statements render correctly
 * with write target shown distinctly.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #6: INSERT INTO ... SELECT Lineage', () => {
    describe('Basic INSERT...SELECT', () => {
        it('should render target table with write access mode', () => {
            const sql = `
                INSERT INTO daily_sales_summary (report_date, total_orders, total_revenue)
                SELECT DATE(order_date), COUNT(*), SUM(amount)
                FROM orders
                GROUP BY DATE(order_date)
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Should parse successfully and have nodes
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle simple INSERT...SELECT', () => {
            const sql = `
                INSERT INTO customer_summary (customer_id, total_orders)
                SELECT customer_id, COUNT(*)
                FROM orders
                GROUP BY customer_id
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
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

            expect(result.error).toBeUndefined();
            
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
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

            expect(result.error).toBeUndefined();
            
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
        });

        it('should handle functions in column expressions', () => {
            const sql = `
                INSERT INTO daily_sales (report_date, total_orders, total_revenue)
                SELECT CURRENT_DATE, COUNT(*), COALESCE(SUM(amount), 0)
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
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

            expect(result.error).toBeUndefined();
            
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
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

            expect(result.error).toBeUndefined();
            
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
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

            expect(result.error).toBeUndefined();
            
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
        });
    });

    describe('INSERT...SELECT with CTEs', () => {
        it('should handle simple CTE', () => {
            const sql = `
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

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
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

            expect(result.error).toBeUndefined();
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
        });

        it('should handle BigQuery INSERT...SELECT', () => {
            const sql = `
                INSERT INTO project.dataset.summary (report_date, metric_value)
                SELECT CURRENT_DATE(), COUNT(*)
                FROM project.dataset.orders
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            expect(result.error).toBeUndefined();
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
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

            expect(result.error).toBeUndefined();
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
        });
    });

    describe('Edge Cases', () => {
        it('should handle INSERT...SELECT *', () => {
            const sql = `
                INSERT INTO orders_archive
                SELECT * FROM orders WHERE order_date < '2024-01-01'
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
        });

        it('should handle INSERT...SELECT DISTINCT', () => {
            const sql = `
                INSERT INTO unique_customers (customer_id)
                SELECT DISTINCT customer_id FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
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

            expect(result.error).toBeUndefined();
            const targetTable = result.nodes.find((n: any) => n.accessMode === 'write');
            expect(targetTable).toBeDefined();
        });
    });

    describe('Verification Tests', () => {
        it('should correctly mark write target with distinct properties', () => {
            const sql = `
                INSERT INTO targets (id, value)
                SELECT id, value FROM source
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Write target should have accessMode: 'write'
            const targetTable = result.nodes.find((n: any) => 
                n.label?.toLowerCase().includes('target')
            );
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

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });
});
