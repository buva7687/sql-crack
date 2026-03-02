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

        it('should parse PostgreSQL MERGE via compatibility parser', () => {
            const sql = `
                MERGE INTO target_table t
                USING source_table s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET t.value = s.value
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // PostgreSQL MERGE now goes through the compatibility parser
            expect(result.partial).toBeUndefined();
            const mergeHint = result.hints?.find((h: any) =>
                h.message?.toLowerCase().includes('merge') &&
                h.suggestion?.toLowerCase().includes('postgresql')
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
        it('renders DO NOTHING conflict handling without fallback', () => {
            const sql = `
                INSERT INTO users (id, name)
                VALUES (1, 'Alice')
                ON CONFLICT (id) DO NOTHING
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const upsertNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPSERT users');
            const hint = result.hints.find((h: any) => h.message?.includes('ON CONFLICT'));

            expect(upsertNode).toBeDefined();
            expect(upsertNode?.description).toContain('ON CONFLICT (id)');
            expect(upsertNode?.description).toContain('DO NOTHING');
            expect(hint?.suggestion).toMatch(/PostgreSQL/i);
        });

        it('renders DO UPDATE columns on the UPSERT node', () => {
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
            expect(result.partial).toBeUndefined();

            const upsertNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPSERT users');
            expect(upsertNode).toBeDefined();
            expect(upsertNode?.description).toContain('ON CONFLICT (id)');
            expect(upsertNode?.description).toContain('DO UPDATE');
            expect(upsertNode?.description).toContain('SET: name, email, updated_at');
        });

        it('keeps SELECT source flow when ON CONFLICT is attached to INSERT ... SELECT', () => {
            const sql = `
                INSERT INTO user_summary (id, total_orders)
                SELECT customer_id, COUNT(*)
                FROM orders
                GROUP BY customer_id
                ON CONFLICT (id) DO UPDATE SET total_orders = EXCLUDED.total_orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            expect(result.error).toBeUndefined();

            const sourceTable = result.nodes.find((n: any) => n.type === 'table' && n.label === 'orders' && !n.accessMode);
            const targetTable = result.nodes.find((n: any) =>
                n.type === 'table' &&
                n.label === 'user_summary' &&
                n.accessMode === 'write' &&
                n.operationType === 'INSERT'
            );
            const upsertNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPSERT user_summary');

            expect(result.partial).toBeUndefined();
            expect(sourceTable).toBeDefined();
            expect(targetTable).toBeDefined();
            expect(upsertNode).toBeDefined();
            expect(result.edges.some((e: any) => e.source === targetTable?.id && e.target === upsertNode?.id)).toBe(true);
        });
    });

    describe('MySQL INSERT ... ON DUPLICATE KEY UPDATE', () => {
        it('renders duplicate-key update semantics for MySQL', () => {
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
            expect(result.partial).toBeUndefined();

            const upsertNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPSERT users');
            const hint = result.hints.find((h: any) => h.message?.includes('ON DUPLICATE KEY UPDATE'));

            expect(upsertNode).toBeDefined();
            expect(upsertNode?.description).toContain('ON DUPLICATE KEY UPDATE');
            expect(upsertNode?.description).toContain('SET: name, email, updated_at');
            expect(hint?.suggestion).toMatch(/MySQL/i);
        });

        it('renders duplicate-key update semantics for MariaDB', () => {
            const sql = `
                INSERT INTO users (id, name)
                VALUES (1, 'Alice')
                ON DUPLICATE KEY UPDATE name = VALUES(name)
            `;
            const result = parseSql(sql, 'MariaDB' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const upsertNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPSERT users');
            const hint = result.hints.find((h: any) => h.message?.includes('ON DUPLICATE KEY UPDATE'));

            expect(upsertNode).toBeDefined();
            expect(upsertNode?.description).toContain('ON DUPLICATE KEY UPDATE');
            expect(upsertNode?.description).toContain('SET: name');
            expect(hint?.suggestion).toMatch(/MariaDB/i);
        });
    });

    describe('SQLite UPSERT', () => {
        it('renders INSERT OR REPLACE semantics without fallback', () => {
            const sql = `
                INSERT OR REPLACE INTO users (id, name)
                VALUES (1, 'Alice')
            `;
            const result = parseSql(sql, 'SQLite' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const replaceNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'INSERT OR REPLACE users');
            const hint = result.hints.find((h: any) => h.message?.includes('INSERT OR REPLACE'));

            expect(replaceNode).toBeDefined();
            expect(replaceNode?.description).toContain('SQLite conflict resolution: REPLACE');
            expect(hint).toBeDefined();
        });

        it('renders INSERT OR IGNORE semantics without fallback', () => {
            const sql = `
                INSERT OR IGNORE INTO users (id, name)
                VALUES (1, 'Alice')
            `;
            const result = parseSql(sql, 'SQLite' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const ignoreNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'INSERT OR IGNORE users');
            expect(ignoreNode).toBeDefined();
            expect(ignoreNode?.description).toContain('SQLite conflict resolution: IGNORE');
        });

        it('parses SQLite ON CONFLICT via proxy AST and preserves conflict details', () => {
            const sql = `
                INSERT INTO users (id, name)
                VALUES (1, 'Alice')
                ON CONFLICT (id) DO UPDATE SET name = excluded.name
            `;
            const result = parseSql(sql, 'SQLite' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const upsertNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPSERT users');
            const hint = result.hints.find((h: any) => h.message?.includes('SQLite ON CONFLICT'));

            expect(upsertNode).toBeDefined();
            expect(upsertNode?.description).toContain('ON CONFLICT (id)');
            expect(upsertNode?.description).toContain('DO UPDATE');
            expect(upsertNode?.description).toContain('SET: name');
            expect(hint?.suggestion).toMatch(/PostgreSQL-compatible conflict AST/i);
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
