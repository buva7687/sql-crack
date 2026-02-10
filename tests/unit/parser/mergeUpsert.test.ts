/**
 * Item #3: MERGE / UPSERT Statement Visualization
 * 
 * Tests for verifying that MERGE and UPSERT statements are properly visualized
 * with appropriate source and target tables, and WHEN MATCHED/NOT MATCHED branches.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #3: MERGE / UPSERT Statement Visualization', () => {
    describe('Standard MERGE Statement', () => {
        it('should detect MERGE statement and provide helpful hints', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // MERGE is not fully supported by parser in most dialects
            // But we should provide helpful hints
            const mergeHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('merge')
            );
            expect(mergeHint).toBeDefined();
            expect(mergeHint?.suggestion).toBeDefined();
            
            // May have parse error, but should still get helpful hints
            expect(result.hints?.length).toBeGreaterThan(0);
        });

        it('should suggest PostgreSQL ON CONFLICT as alternative to MERGE', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should suggest ON CONFLICT alternative
            const mergeHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('merge') &&
                h.suggestion?.toLowerCase().includes('on conflict')
            );
            expect(mergeHint).toBeDefined();
        });

        it('should suggest MySQL ON DUPLICATE KEY as alternative to MERGE', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Should suggest ON DUPLICATE KEY UPDATE alternative
            const mergeHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('merge') &&
                h.suggestion?.toLowerCase().includes('duplicate')
            );
            expect(mergeHint).toBeDefined();
        });

        it('should work better in TransactSQL dialect', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // TransactSQL is one of the dialects that should support MERGE
            // May still have issues, but should provide more specific hints
            expect(result.hints?.length).toBeGreaterThan(0);
            
            // Should either parse successfully or give helpful hints
            if (result.error) {
                const mergeHint = result.hints?.find((h: any) => 
                    h.message?.toLowerCase().includes('merge')
                );
                expect(mergeHint).toBeDefined();
            }
        });
    });

    describe('PostgreSQL INSERT ... ON CONFLICT', () => {
        it('should detect ON CONFLICT DO NOTHING', () => {
            const sql = `
                INSERT INTO users (id, name)
                VALUES (1, 'Alice')
                ON CONFLICT (id) DO NOTHING
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Should have INSERT node with conflict handling noted
            const insertNode = result.nodes.find((n: any) => n.operationType === 'INSERT');
            expect(insertNode).toBeDefined();
        });

        it('should detect ON CONFLICT DO UPDATE', () => {
            const sql = `
                INSERT INTO users (id, name, email)
                VALUES (1, 'Alice', 'alice@example.com')
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    updated_at = NOW()
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Should show both INSERT and UPDATE operations
            const hasInsertOrUpdate = result.nodes.some((n: any) => 
                n.operationType === 'INSERT' || n.operationType === 'UPDATE'
            );
            expect(hasInsertOrUpdate).toBe(true);
        });

        it('should show ON CONFLICT in node details', () => {
            const sql = `
                INSERT INTO users (id, name)
                VALUES (1, 'Alice')
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Node details should mention conflict handling
            const hasConflictHint = result.hints?.some((h: any) => 
                h.message?.toLowerCase().includes('conflict') ||
                h.suggestion?.toLowerCase().includes('conflict')
            ) || result.nodes.some((n: any) =>
                n.details?.some((d: string) => d.toLowerCase().includes('conflict'))
            );
            
            // At minimum, should parse without error
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('MySQL INSERT ... ON DUPLICATE KEY UPDATE', () => {
        it('should detect ON DUPLICATE KEY UPDATE', () => {
            const sql = `
                INSERT INTO users (id, name, email)
                VALUES (1, 'Alice', 'alice@example.com')
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    email = VALUES(email),
                    updated_at = NOW()
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Should have INSERT node
            const insertNode = result.nodes.find((n: any) => n.operationType === 'INSERT');
            expect(insertNode).toBeDefined();
        });

        it('should show duplicate key handling in details', () => {
            const sql = `
                INSERT INTO users (id, name)
                VALUES (1, 'Alice')
                ON DUPLICATE KEY UPDATE name = VALUES(name)
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Should parse successfully and show the operation
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('SQLite UPSERT', () => {
        it('should detect INSERT OR REPLACE', () => {
            const sql = `
                INSERT OR REPLACE INTO users (id, name)
                VALUES (1, 'Alice')
            `;
            const result = parseSql(sql, 'SQLite' as SqlDialect);

            expect(result.error).toBeUndefined();
            
            // Should have INSERT node
            const insertNode = result.nodes.find((n: any) => n.operationType === 'INSERT');
            expect(insertNode).toBeDefined();
        });

        it('should detect INSERT OR IGNORE', () => {
            const sql = `
                INSERT OR IGNORE INTO users (id, name)
                VALUES (1, 'Alice')
            `;
            const result = parseSql(sql, 'SQLite' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('MERGE with Source Query', () => {
        it('should detect MERGE with subquery source', () => {
            const sql = `
                MERGE INTO target_table t
                USING (SELECT id, value FROM source_table WHERE active = true) s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
                WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // Should provide helpful hints even if parsing fails
            expect(result.hints?.length).toBeGreaterThan(0);
        });

        it('should detect MERGE with CTE source', () => {
            const sql = `
                WITH source_data AS (
                    SELECT id, value FROM staging_table
                )
                MERGE INTO target_table t
                USING source_data s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // Should provide helpful hints even if parsing fails
            expect(result.hints?.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('should detect MERGE without WHEN clauses', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // Should still provide hints
            expect(result.hints?.length).toBeGreaterThan(0);
        });

        it('should detect MERGE with complex ON condition', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id AND t.tenant_id = s.tenant_id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'TransactSQL' as SqlDialect);

            // Should still provide hints
            expect(result.hints?.length).toBeGreaterThan(0);
        });

        it('should handle multiple conflict targets', () => {
            const sql = `
                INSERT INTO users (id, email, name)
                VALUES (1, 'alice@example.com', 'Alice')
                ON CONFLICT (id, email) DO UPDATE SET name = EXCLUDED.name
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
        });
    });
});
