/**
 * Item #3: MERGE Statement Visualization
 *
 * Tests for enhanced MERGE statement visualization using the compatibility parser.
 * Shows MERGE operation with source, target, and WHEN clauses.
 *
 * The compatibility parser handles: TransactSQL, Oracle, Snowflake, BigQuery,
 * Teradata, and PostgreSQL. Dialects outside that list (e.g. MySQL) fall back
 * to the generic regex fallback parser.
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
            const result = parseSql(sql, 'Snowflake' as SqlDialect);

            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.partial).toBeUndefined();

            const mergeNode = result.nodes.find((n: any) => n.operationType === 'MERGE');
            expect(mergeNode).toBeDefined();
        });

        it('should extract WHEN MATCHED clause', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'Oracle' as SqlDialect);

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            expect(mergeNode).toBeDefined();
            expect(mergeNode!.description).toContain('MATCHED');
        });

        it('should extract WHEN NOT MATCHED clause', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            expect(mergeNode).toBeDefined();
            expect(mergeNode!.description).toContain('NOT MATCHED');
        });

        it('should extract both WHEN MATCHED and WHEN NOT MATCHED', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            expect(mergeNode).toBeDefined();
            expect(mergeNode!.description).toContain('MATCHED');
            expect(mergeNode!.description).toContain('NOT MATCHED');
        });

        it('should create edges from source to MERGE to target', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.edges.length).toBeGreaterThan(0);
            expect(result.partial).toBeUndefined();

            const sourceEdge = result.edges.find((e: any) => e.clauseType === 'merge_source');
            expect(sourceEdge).toBeDefined();

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
            const result = parseSql(sql, 'Snowflake' as SqlDialect);

            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.partial).toBeUndefined();

            const sourceNode = result.nodes.find((n: any) => n.label === 'source_table');
            expect(sourceNode).toBeDefined();
        });

        it('does not promote nested scalar-subquery tables to direct merge sources', () => {
            const sql = `
                MERGE INTO target_table t
                USING (
                    SELECT id, value
                    FROM source_table s
                    WHERE EXISTS (
                        SELECT 1
                        FROM audit_log a
                        WHERE a.id = s.id
                    )
                ) src
                ON t.id = src.id
                WHEN MATCHED THEN UPDATE SET t.value = src.value
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            const nodeById = new Map(result.nodes.map((node: any) => [node.id, node]));
            const mergeSourceLabels = result.edges
                .filter((edge: any) => edge.clauseType === 'merge_source')
                .map((edge: any) => nodeById.get(edge.source)?.label);

            expect(mergeSourceLabels).toContain('source_table');
            expect(mergeSourceLabels).not.toContain('audit_log');
            expect(result.nodes.some((n: any) => n.label === 'audit_log')).toBe(true);
            expect(result.partial).toBeUndefined();
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
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.partial).toBeUndefined();

            const cteNode = result.nodes.find((n: any) => n.label === 'source_cte');
            expect(cteNode).toBeDefined();
            expect(cteNode?.tableCategory).toBe('cte_reference');

            const sourceEdge = result.edges.find((e: any) => e.clauseType === 'merge_source');
            expect(sourceEdge).toBeDefined();
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
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.partial).toBeUndefined();
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

            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.partial).toBeUndefined();
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

            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.partial).toBeUndefined();
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

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            expect(mergeNode).toBeDefined();
            expect(result.partial).toBeUndefined();
        });

        it('should handle MERGE with complex ON condition', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id AND t.date = s.date AND t.status = 'active'
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'Oracle' as SqlDialect);

            const mergeNode = result.nodes.find((n: any) => n.label.startsWith('MERGE'));
            expect(mergeNode).toBeDefined();
            expect(mergeNode!.description).toContain('ON:');
            expect(result.partial).toBeUndefined();
        });

        it('should handle MERGE with schema-qualified tables', () => {
            const sql = `
                MERGE INTO dbo.target_table t
                USING staging.source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

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
            expect(result.partial).toBeUndefined();
        });
    });

    describe('Dialect-Specific Hints', () => {
        it('should provide PostgreSQL compatibility hint', () => {
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
            expect(mergeHint?.suggestion).toMatch(/PostgreSQL/i);
            expect(result.partial).toBeUndefined();
        });

        it('should provide MySQL fallback hint (not a compatibility dialect)', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // MySQL is not in the compatibility list, so it hits the generic fallback
            const mergeHint = result.hints.find((h: any) =>
                h.message?.toLowerCase().includes('merge') && h.category === 'best-practice'
            );
            expect(mergeHint).toBeDefined();
            expect(mergeHint?.suggestion).toMatch(/ON DUPLICATE KEY/i);
            expect(result.partial).toBe(true);
        });

        it('should provide TransactSQL compatibility hint', () => {
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
            expect(result.partial).toBeUndefined();
        });
    });
});
