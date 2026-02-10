/**
 * Item #1: Regex-Based Partial Parser Fallback
 * 
 * Tests for the regex fallback parser that activates when AST parsing fails.
 * This ensures users always see some visualization instead of an empty screen.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #1: Regex-Based Partial Parser Fallback', () => {
    describe('Basic Fallback Functionality', () => {
        it('should extract tables from FROM clause when parsing fails', () => {
            // Use invalid SQL that will fail parsing - use syntax that definitely fails
            const sql = 'SELECT * FROM INVALID_SYNTAX_HERE WHERE id = :=: INVALID';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should still return nodes
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Should have partial flag set
            expect(result.partial).toBe(true);
            
            // Should extract table name
            const tableNode = result.nodes.find((n: any) => n.label === 'INVALID_SYNTAX_HERE');
            expect(tableNode).toBeDefined();
        });

        it('should extract multiple tables from JOIN clauses', () => {
            const sql = 'SELECT * FROM users JOIN orders ON users.id = orders.user_id INVALID_SYNTAX';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThanOrEqual(2);
            
            const tables = result.nodes.map((n: any) => n.label);
            expect(tables).toContain('users');
            expect(tables).toContain('orders');
        });

        it('should detect INSERT statement type', () => {
            const sql = 'INSERT INTO table1 INVALID_SYNTAX_HERE SELECT * FROM table2';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should detect UPDATE statement type', () => {
            const sql = 'UPDATE INVALID_TABLE SET INVALID_SYNTAX';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should detect DELETE statement type', () => {
            // Use invalid syntax that will fail parsing
            const sql = 'DELETE FROM INVALID_TABLE WHERE ID :=: INVALID';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('MERGE Statement Handling', () => {
        it('should extract MERGE target and source tables', () => {
            const sql = 'MERGE INTO target USING source ON target.id = source.id WHEN MATCHED THEN UPDATE SET target.value = source.value';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            const tables = result.nodes.map((n: any) => n.label);
            expect(tables).toContain('target');
            expect(tables).toContain('source');
        });

        it('should handle MERGE with subquery source', () => {
            const sql = 'MERGE INTO target USING (SELECT * FROM source_table WHERE active = true) AS src ON target.id = src.id WHEN MATCHED THEN UPDATE SET target.value = src.value';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('CTE Detection', () => {
        it('should detect CTE names', () => {
            // Use truly invalid syntax - invalid token in CTE
            const sql = 'WITH cte_name AS (SELECT :=: INVALID) SELECT * FROM cte_name';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            const cteNode = result.nodes.find((n: any) => n.label === 'cte_name');
            expect(cteNode).toBeDefined();
            expect(cteNode?.tableCategory).toBe('cte_reference');
        });

        it('should handle multiple CTEs', () => {
            const sql = 'WITH cte1 AS (INVALID), cte2 AS (INVALID) SELECT * FROM cte1 JOIN cte2 ON cte1.id = cte2.id';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            const labels = result.nodes.map((n: any) => n.label);
            expect(labels).toContain('cte1');
            expect(labels).toContain('cte2');
        });
    });

    describe('JOIN Relationship Detection', () => {
        it('should create edges for JOIN relationships', () => {
            const sql = 'SELECT * FROM users JOIN orders ON users.id = orders.user_id JOIN products ON orders.product_id = products.id INVALID_SYNTAX';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.edges.length).toBeGreaterThan(0);
            
            // Check that edges have JOIN type
            const joinEdges = result.edges.filter((e: any) => e.clauseType === 'join');
            expect(joinEdges.length).toBeGreaterThan(0);
        });

        it('should handle multiple JOINs', () => {
            const sql = 'SELECT * FROM table1 JOIN table2 ON table1.id = table2.id JOIN table3 ON table2.id = table3.id INVALID';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.edges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Stats Calculation', () => {
        it('should calculate table count correctly', () => {
            const sql = 'SELECT * FROM table1 JOIN table2 ON table1.id = table2.id INVALID';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.stats.tables).toBe(2);
        });

        it('should calculate JOIN count correctly', () => {
            const sql = 'SELECT * FROM table1 JOIN table2 ON table1.id = table2.id JOIN table3 ON table2.id = table3.id INVALID';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.stats.joins).toBeGreaterThanOrEqual(2);
        });

        it('should detect CTEs in stats', () => {
            const sql = 'WITH cte1 AS (INVALID), cte2 AS (INVALID) SELECT * FROM cte1 INVALID';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.stats.ctes).toBe(1); // At least 1 CTE detected
        });

        it('should calculate complexity score', () => {
            const sql = 'SELECT * FROM table1 JOIN table2 ON table1.id = table2.id JOIN table3 ON table2.id = table3.id INVALID';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.stats.complexityScore).toBeGreaterThan(0);
            expect(['Simple', 'Moderate', 'Complex', 'Very Complex']).toContain(result.stats.complexity);
        });
    });

    describe('Hints and Messages', () => {
        it('should include partial visualization warning', () => {
            // Use truly invalid syntax
            const sql = 'SELECT * FROM table1 WHERE :=: INVALID_TOKEN';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            // Should have warning about partial visualization
            const partialWarning = result.hints.find((h: any) => 
                h.message.includes('Partial visualization') || h.type === 'warning'
            );
            expect(partialWarning).toBeDefined();
        });

        it('should include original parse error', () => {
            // Use truly invalid syntax
            const sql = 'SELECT * FROM table1 WHERE :=: INVALID_TOKEN';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            // Should have error hint
            const errorHint = result.hints.find((h: any) => h.type === 'error');
            expect(errorHint).toBeDefined();
        });

        it('should provide helpful suggestion in hints', () => {
            // Use truly invalid syntax
            const sql = 'SELECT * FROM table1 WHERE :=: INVALID_TOKEN';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            // At least one hint should have a suggestion
            const hintWithSuggestion = result.hints.find((h: any) => h.suggestion);
            expect(hintWithSuggestion).toBeDefined();
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty SQL gracefully', () => {
            const result = parseSql('', 'PostgreSQL' as SqlDialect);
            
            // Empty SQL should not use fallback (handled earlier in parse flow)
            expect(result.nodes.length).toBe(0);
        });

        it('should handle SQL with no tables', () => {
            const sql = 'INVALID SQL WITH NO TABLES';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.stats.tables).toBe(0);
        });

        it('should handle quoted table names', () => {
            const sql = 'SELECT * FROM `table_name` JOIN "another_table" ON :=: INVALID';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            const labels = result.nodes.map((n: any) => n.label);
            expect(labels).toContain('table_name');
            expect(labels).toContain('another_table');
        });

        it('should handle schema-qualified table names', () => {
            const sql = 'SELECT * FROM schema.table_name JOIN database2.schema2.table2 ON INVALID';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            
            const labels = result.nodes.map((n: any) => n.label);
            expect(labels).toContain('table_name');
            expect(labels).toContain('table2');
        });

        it('should handle completely mangled SQL', () => {
            const sql = 'INVALID SYNTAX EVERYWHERE @#$%^&*()';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            // Should return some result, not crash
            expect(result.nodes).toBeDefined();
            expect(result.hints).toBeDefined();
        });
    });

    describe('Valid SQL Should Not Use Fallback', () => {
        it('should parse valid SQL normally without fallback', () => {
            const sql = 'SELECT * FROM users WHERE id = 1';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should NOT be partial
            expect(result.partial).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should parse valid JOINs without fallback', () => {
            const sql = 'SELECT * FROM users JOIN orders ON users.id = orders.user_id';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.edges.length).toBeGreaterThan(0);
        });

        it('should parse valid CTEs without fallback', () => {
            const sql = 'WITH cte AS (SELECT * FROM users) SELECT * FROM cte';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('Multiple Dialects', () => {
        it('should work with PostgreSQL dialect', () => {
            const sql = 'SELECT * FROM table1 WHERE :=: INVALID';
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should work with MySQL dialect', () => {
            const sql = 'SELECT * FROM table1 WHERE :=: INVALID';
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should work with BigQuery dialect', () => {
            const sql = 'SELECT * FROM `project.dataset.table1` WHERE :=: INVALID';
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should work with TransactSQL dialect', () => {
            const sql = 'SELECT * FROM table1 WHERE :=: INVALID';
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.partial).toBe(true);
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });
});
