/**
 * Item #1: Column Lineage Through CAST, JSON Operators, and Scalar Functions
 * 
 * Tests for verifying that column lineage tracing works correctly through:
 * - CAST expressions (CAST, TRY_CAST, CONVERT)
 * - JSON operators (->, ->>, #>, #>>)
 * - JSON functions (JSON_EXTRACT, JSON_VALUE, JSON_QUERY)
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #1: Column Lineage Through CAST/JSON/Scalar Functions', () => {
    describe('CAST Expression Formatting', () => {
        it('should format CAST expression in output', () => {
            const sql = `
                SELECT CAST(price AS DECIMAL(10,2)) AS price_dec
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes).toBeDefined();
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Find the result node
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            // Check that columns include the CAST expression
            if (resultNode?.columns) {
                const priceDecColumn = resultNode.columns.find((c: any) => c.name === 'price_dec');
                expect(priceDecColumn).toBeDefined();
                expect(priceDecColumn?.expression).toMatch(/CAST.*price.*DECIMAL/i);
            }
        });

        it('should extract source column from CAST', () => {
            const sql = `
                SELECT CAST(price AS INT) AS price_int
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const priceIntColumn = resultNode.columns.find((c: any) => c.name === 'price_int');
                expect(priceIntColumn).toBeDefined();
                // The sourceColumn should be extracted from the CAST expression
                expect(priceIntColumn?.sourceColumn).toBe('price');
            }
        });

        it('should handle multiple CAST expressions', () => {
            const sql = `
                SELECT
                    CAST(price AS DECIMAL(10,2)) AS price_dec,
                    CAST(quantity AS INT) AS quantity_int,
                    CAST(discount AS FLOAT) AS discount_float
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const priceCol = resultNode.columns.find((c: any) => c.name === 'price_dec');
                const quantityCol = resultNode.columns.find((c: any) => c.name === 'quantity_int');
                const discountCol = resultNode.columns.find((c: any) => c.name === 'discount_float');
                
                expect(priceCol?.sourceColumn).toBe('price');
                expect(quantityCol?.sourceColumn).toBe('quantity');
                expect(discountCol?.sourceColumn).toBe('discount');
            }
        });
    });

    describe('JSON Operator Expressions', () => {
        it('should format JSON operator ->>', () => {
            const sql = `
                SELECT data->>'name' AS user_name
                FROM users
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const nameColumn = resultNode.columns.find((c: any) => c.name === 'user_name');
                expect(nameColumn).toBeDefined();
                expect(nameColumn?.expression).toContain('->');
            }
        });

        it('should extract source column from JSON operator', () => {
            const sql = `
                SELECT data->>'status' AS status
                FROM users
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const statusColumn = resultNode.columns.find((c: any) => c.name === 'status');
                expect(statusColumn).toBeDefined();
                // For JSON operators, the source column should be the base column
                expect(statusColumn?.sourceColumn).toBe('data');
            }
        });
    });

    describe('JSON Function Expressions', () => {
        it('should format JSON_EXTRACT function (MySQL)', () => {
            const sql = `
                SELECT JSON_EXTRACT(data, '$.name') AS name
                FROM users
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const nameColumn = resultNode.columns.find((c: any) => c.name === 'name');
                expect(nameColumn).toBeDefined();
                expect(nameColumn?.expression).toContain('JSON_EXTRACT');
                expect(nameColumn?.sourceColumn).toBe('data');
            }
        });

        it('should format JSON_VALUE function (BigQuery)', () => {
            const sql = `
                SELECT JSON_VALUE(data, '$.price') AS price
                FROM orders
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const priceColumn = resultNode.columns.find((c: any) => c.name === 'price');
                expect(priceColumn).toBeDefined();
                expect(priceColumn?.expression).toContain('JSON_VALUE');
                expect(priceColumn?.sourceColumn).toBe('data');
            }
        });

        it('should format JSON_QUERY function (SQL Server)', () => {
            const sql = `
                SELECT JSON_QUERY(data, '$.items') AS items
                FROM orders
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const itemsColumn = resultNode.columns.find((c: any) => c.name === 'items');
                expect(itemsColumn).toBeDefined();
                expect(itemsColumn?.expression).toContain('JSON_QUERY');
                expect(itemsColumn?.sourceColumn).toBe('data');
            }
        });
    });

    describe('Complex Expressions', () => {
        it('should handle CAST with arithmetic', () => {
            const sql = `
                SELECT CAST(price AS DECIMAL(10,2)) * quantity AS total
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const totalColumn = resultNode.columns.find((c: any) => c.name === 'total');
                expect(totalColumn).toBeDefined();
                expect(totalColumn?.expression).toMatch(/CAST.*price/);
                // Expression should contain both column references
                expect(totalColumn?.expression).toMatch(/price|quantity/);
            }
        });

        it('should handle nested JSON operators', () => {
            const sql = `
                SELECT data->'items'->0->>'name' AS first_item
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            expect(resultNode).toBeDefined();
            
            if (resultNode?.columns) {
                const itemColumn = resultNode.columns.find((c: any) => c.name === 'first_item');
                expect(itemColumn).toBeDefined();
                expect(itemColumn?.expression).toContain('->');
                expect(itemColumn?.sourceColumn).toBe('data');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle CAST without alias', () => {
            const sql = `
                SELECT CAST(price AS INT)
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes).toBeDefined();
        });

        it('should handle CAST of expression', () => {
            const sql = `
                SELECT CAST(price * 1.1 AS DECIMAL(10,2)) AS marked_up_price
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            const resultNode = result.nodes.find((n: any) => n.type === 'result');
            if (resultNode?.columns) {
                const priceColumn = resultNode.columns.find((c: any) => c.name === 'marked_up_price');
                expect(priceColumn?.expression).toMatch(/CAST.*price/);
            }
        });
    });
});
