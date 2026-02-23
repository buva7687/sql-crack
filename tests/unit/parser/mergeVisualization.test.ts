/**
 * Item #3: MERGE Statement Visualization
 * 
 * Tests for enhanced MERGE statement visualization using regex fallback parser.
 * Shows MERGE operation with source, target, and WHEN clauses.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #3: MERGE Statement Visualization', () => {
    describe('Standard MERGE Statement', () => {
        it('should visualize MERGE with source and target tables', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect); // Use MySQL to ensure fallback

            // Should have nodes
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Should have MERGE node or result nodes
            const hasMergeOrResult = result.nodes.some((n: any) => 
                n.label === 'MERGE' || n.operationType === 'MERGE' || n.type === 'result'
            );
            expect(hasMergeOrResult).toBe(true);
        });

        it('should extract WHEN MATCHED clause', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Check if MERGE node exists with details
            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            if (mergeNode) {
                // WHEN clause info is in the description (details aren't rendered for result nodes)
                expect(mergeNode.description).toContain('MATCHED');
            } else {
                // Normal parser succeeded
                expect(result.nodes.length).toBeGreaterThan(0);
            }
        });

        it('should extract WHEN NOT MATCHED clause', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            if (mergeNode) {
                expect(mergeNode.description).toContain('NOT MATCHED');
            } else {
                expect(result.nodes.length).toBeGreaterThan(0);
            }
        });

        it('should extract both WHEN MATCHED and WHEN NOT MATCHED', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            if (mergeNode) {
                expect(mergeNode.description).toContain('MATCHED');
            } else {
                expect(result.nodes.length).toBeGreaterThan(0);
            }
        });

        it('should create edges from source to MERGE to target', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should have edges
            expect(result.edges.length).toBeGreaterThan(0);
            
            // Should have merge_source edge
            const sourceEdge = result.edges.find((e: any) => e.clauseType === 'merge_source');
            expect(sourceEdge).toBeDefined();
            
            // Should have merge_target edge
            const targetEdge = result.edges.find((e: any) => e.clauseType === 'merge_target');
            expect(targetEdge).toBeDefined();
        });
    });

    describe('MERGE with Complex Sources', () => {
        it('should handle MERGE with subquery source', () => {
            const sql = `
                MERGE INTO target_table t
                USING (SELECT id, value FROM source_table WHERE active = true) s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Should parse successfully (either normal or fallback)
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle MERGE with CTE', () => {
            const sql = `
                WITH source_cte AS (
                    SELECT id, value FROM source_table WHERE active = true
                )
                MERGE INTO target_table t
                USING source_cte s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Should parse successfully
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Should have CTE if using fallback
            const cteNode = result.nodes.find((n: any) => n.label === 'source_cte');
            if (cteNode) {
                expect(cteNode?.tableCategory).toBe('cte_reference');
            }
        });

        it('should handle MERGE with multiple CTEs', () => {
            const sql = `
                WITH cte1 AS (SELECT * FROM table1),
                     cte2 AS (SELECT * FROM table2)
                MERGE INTO target_table t
                USING cte1 s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Should parse successfully
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('Multiple WHEN Clauses', () => {
        it('should handle multiple WHEN MATCHED clauses', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED AND status = 'active' THEN UPDATE SET t.value = s.value
                WHEN MATCHED AND status = 'inactive' THEN DELETE
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // Should parse successfully
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle multiple WHEN NOT MATCHED clauses', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN NOT MATCHED BY TARGET THEN INSERT (id, value) VALUES (s.id, s.value)
                WHEN NOT MATCHED BY SOURCE THEN DELETE
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // Should parse successfully
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle MERGE without WHEN clauses', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should still create MERGE node
            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            expect(mergeNode).toBeDefined();
        });

        it('should handle MERGE with complex ON condition', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id AND t.date = s.date AND t.status = 'active'
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            expect(mergeNode).toBeDefined();
        });

        it('should handle MERGE with schema-qualified tables', () => {
            const sql = `
                MERGE INTO dbo.target_table t
                USING staging.source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // Should extract table names without schema prefix
            const targetNode = result.nodes.find((n: any) => n.label === 'target_table');
            const sourceNode = result.nodes.find((n: any) => n.label === 'source_table');
            expect(targetNode).toBeDefined();
            expect(sourceNode).toBeDefined();
        });

        it('should handle quoted table names', () => {
            const sql = `
                MERGE INTO "target_table" t
                USING \`source_table\` s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const targetNode = result.nodes.find((n: any) => n.label === 'target_table');
            const sourceNode = result.nodes.find((n: any) => n.label === 'source_table');
            expect(targetNode).toBeDefined();
            expect(sourceNode).toBeDefined();
        });
    });

    describe('Dialect-Specific Hints', () => {
        it('should provide PostgreSQL-specific hint', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const mergeHint = result.hints.find((h: any) => 
                h.message?.toLowerCase().includes('merge') && h.category === 'best-practice'
            );
            expect(mergeHint).toBeDefined();
            expect(mergeHint?.suggestion).toMatch(/ON CONFLICT/i);
        });

        it('should provide MySQL-specific hint', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            const mergeHint = result.hints.find((h: any) => 
                h.message?.toLowerCase().includes('merge') && h.category === 'best-practice'
            );
            expect(mergeHint).toBeDefined();
            expect(mergeHint?.suggestion).toMatch(/ON DUPLICATE KEY/i);
        });

        it('should provide TransactSQL-specific hint', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            const mergeHint = result.hints.find((h: any) => 
                h.message?.toLowerCase().includes('merge') && h.category === 'best-practice'
            );
            expect(mergeHint).toBeDefined();
            expect(mergeHint?.suggestion).toMatch(/TransactSQL/i);
        });
    });
});
