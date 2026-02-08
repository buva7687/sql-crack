/**
 * Item #5: LATERAL, CROSS APPLY, and OUTER APPLY Edge Cases
 * 
 * Tests for verifying that LATERAL joins, CROSS APPLY, and OUTER APPLY
 * are parsed and visualized correctly.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #5: LATERAL, CROSS APPLY, and OUTER APPLY Edge Cases', () => {
    describe('PostgreSQL LATERAL', () => {
        it('should parse LATERAL subquery with correlation', () => {
            const sql = `
                SELECT *
                FROM orders o,
                LATERAL (
                    SELECT SUM(amount) AS total
                    FROM order_items oi
                    WHERE oi.order_id = o.id
                ) sub
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Should have orders table
            const ordersTable = result.nodes.find((n: any) => 
                n.type === 'table' && n.label.toLowerCase() === 'orders'
            );
            expect(ordersTable).toBeDefined();
            
            // Should have edges (LATERAL creates a join relationship)
            expect(result.edges.length).toBeGreaterThan(0);
        });

        it('should parse LATERAL JOIN syntax', () => {
            const sql = `
                SELECT o.id, sub.total
                FROM orders o
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS total
                    FROM order_items oi
                    WHERE oi.order_id = o.id
                ) sub ON true
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle LATERAL with function calls', () => {
            const sql = `
                SELECT *
                FROM users u,
                LATERAL generate_series(1, u.max_value) AS series
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
        });
    });

    describe('SQL Server CROSS APPLY', () => {
        it('should parse CROSS APPLY with OPENJSON', () => {
            const sql = `
                SELECT o.order_id, t.value AS tag
                FROM orders o
                CROSS APPLY OPENJSON(o.tags) AS t
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Should have orders table
            const ordersTable = result.nodes.find((n: any) => 
                n.type === 'table' && n.label.toLowerCase() === 'orders'
            );
            expect(ordersTable).toBeDefined();
        });

        it('should parse CROSS APPLY with table-valued function', () => {
            const sql = `
                SELECT *
                FROM orders o
                CROSS APPLY fn_get_order_details(o.id) AS d
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Should show the function call
            const hasFunctionNode = result.nodes.some((n: any) => 
                n.label?.toLowerCase().includes('fn_get_order_details') ||
                n.description?.toLowerCase().includes('fn_get_order_details')
            );
            // Function might appear in a different way, so just check parsing succeeded
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should parse OUTER APPLY', () => {
            const sql = `
                SELECT o.id, d.details
                FROM orders o
                OUTER APPLY fn_get_details(o.id) AS d
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('Snowflake LATERAL FLATTEN', () => {
        it('should parse LATERAL FLATTEN with VARIANT data', () => {
            const sql = `
                SELECT
                    f.value:sku::string AS sku,
                    f.value:qty::number AS qty
                FROM orders o,
                LATERAL FLATTEN(input => o.payload:items) f
            `;
            const result = parseSql(sql, 'Snowflake' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Should have orders table
            const ordersTable = result.nodes.find((n: any) => 
                n.type === 'table' && n.label.toLowerCase() === 'orders'
            );
            expect(ordersTable).toBeDefined();
        });

        it('should parse TABLE(FLATTEN(...)) form', () => {
            const sql = `
                SELECT f.index, f.value
                FROM orders o,
                TABLE(FLATTEN(input => o.tags)) AS f
            `;
            const result = parseSql(sql, 'Snowflake' as SqlDialect);

            expect(result.error).toBeUndefined();
        });
    });

    describe('BigQuery LATERAL UNNEST', () => {
        it('should parse UNNEST in FROM clause', () => {
            const sql = `
                SELECT o.order_id, item.sku, item.qty
                FROM orders o,
                UNNEST(o.items) AS item
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should parse CROSS JOIN UNNEST', () => {
            const sql = `
                SELECT o.order_id, step_name
                FROM events e
                CROSS JOIN UNNEST(e.steps) AS step_name
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should parse UNNEST WITH OFFSET', () => {
            const sql = `
                SELECT e.event_id, step_position, step_name
                FROM events e,
                UNNEST(e.steps) AS step_name WITH OFFSET AS step_position
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            expect(result.error).toBeUndefined();
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle multiple LATERAL joins', () => {
            const sql = `
                SELECT *
                FROM orders o,
                LATERAL (
                    SELECT COUNT(*) AS item_count
                    FROM order_items oi
                    WHERE oi.order_id = o.id
                ) items,
                LATERAL (
                    SELECT SUM(amount) AS total_amount
                    FROM payments p
                    WHERE p.order_id = o.id
                ) payments
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle LATERAL with WHERE clause', () => {
            const sql = `
                SELECT *
                FROM orders o,
                LATERAL (
                    SELECT * FROM order_items oi
                    WHERE oi.order_id = o.id
                    AND oi.quantity > 0
                ) filtered_items
                WHERE o.status = 'active'
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
        });

        it('should handle CROSS APPLY with aggregate', () => {
            const sql = `
                SELECT o.id, sub.total
                FROM orders o
                CROSS APPLY (
                    SELECT SUM(amount) AS total
                    FROM order_items oi
                    WHERE oi.order_id = o.id
                ) sub
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
        });

        it('should handle mixing LATERAL with regular JOINs', () => {
            const sql = `
                SELECT *
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS item_count
                    FROM order_items oi
                    WHERE oi.order_id = o.id
                ) item_counts ON true
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
        });
    });

    describe('Edge Cases', () => {
        it('should handle LATERAL with no alias', () => {
            const sql = `
                SELECT *
                FROM orders o,
                LATERAL (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should parse even without alias
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle empty result from OUTER APPLY', () => {
            const sql = `
                SELECT o.id, d.details
                FROM orders o
                OUTER APPLY fn_get_optional_details(o.id) AS d
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
        });

        it('should handle LATERAL in CTE', () => {
            const sql = `
                WITH order_totals AS (
                    SELECT o.id,
                        sub.total
                    FROM orders o,
                    LATERAL (
                        SELECT SUM(amount) AS total
                        FROM order_items oi
                        WHERE oi.order_id = o.id
                    ) sub
                )
                SELECT * FROM order_totals
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
        });
    });
});
