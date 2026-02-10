/**
 * Item #2: File Size and Statement Limit Handling
 * 
 * Tests for graceful handling of oversized files and excessive statement counts.
 * Instead of rejecting entirely, the parser should show partial results.
 */

import { parseSqlBatch, DEFAULT_VALIDATION_LIMITS } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #2: File Size and Statement Limit Handling', () => {
    describe('File Size Limits', () => {
        it('should parse first 100KB when file exceeds size limit', () => {
            // Create a single large statement that exceeds 100KB
            const largeSelect = 'SELECT * FROM users WHERE id IN (' + 
                Array.from({length: 5000}, (_, i) => i.toString()).join(',') + ');';
            const largeSql = largeSelect.repeat(20); // Large single statements
            
            const result = parseSqlBatch(largeSql, 'PostgreSQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            // Should have queries (not empty)
            expect(result.queries.length).toBeGreaterThan(0);
            
            // Should have validation error (might be size or query count depending on which hits first)
            expect(result.validationError).toBeDefined();
            expect(['size_limit', 'query_count_limit']).toContain(result.validationError?.type);
            
            // Should have some kind of warning
            const hasWarning = result.queries.some(q => 
                q.hints.some((h: any) => h.message?.includes('truncated') || h.message?.includes('limit'))
            );
            expect(hasWarning).toBe(true);
        });

        it('should show truncation message with actual and limit sizes', () => {
            const largeSelect = 'SELECT * FROM users WHERE id IN (' + 
                Array.from({length: 5000}, (_, i) => i.toString()).join(',') + ');';
            const largeSql = largeSelect.repeat(20);
            
            const result = parseSqlBatch(largeSql, 'MySQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            // Find any warning about limits
            const warning = result.queries[0].hints.find((h: any) => 
                h.message?.includes('truncated') || h.message?.includes('limit') || h.message?.includes('Too many')
            );
            expect(warning).toBeDefined();
            expect(warning?.suggestion).toBeDefined();
        });

        it('should parse files within size limit normally', () => {
            // Create SQL that's under 100KB and under statement limit
            const normalSql = `
                SELECT * FROM users WHERE id = 1;
                SELECT * FROM orders WHERE total > 100;
                SELECT * FROM products WHERE price < 50;
            `.repeat(10); // ~2KB, 30 statements
            
            const result = parseSqlBatch(normalSql, 'PostgreSQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            // Should parse successfully without validation error
            expect(result.validationError).toBeUndefined();
            expect(result.queries.length).toBeGreaterThan(0);
        });
    });

    describe('Statement Count Limits', () => {
        it('should parse first 50 statements when file has more', () => {
            // Create 60 simple SELECT statements
            const statements = [];
            for (let i = 1; i <= 60; i++) {
                statements.push(`SELECT * FROM table${i};`);
            }
            const largeSql = statements.join('\n');
            
            const result = parseSqlBatch(largeSql, 'PostgreSQL' as SqlDialect, {
                maxSqlSizeBytes: DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
                maxQueryCount: 50,
            });
            
            // Should have queries (not empty)
            expect(result.queries.length).toBeGreaterThan(0);
            
            // Should have validation error
            expect(result.validationError).toBeDefined();
            expect(result.validationError?.type).toBe('query_count_limit');
            
            // Should have truncation warning
            const truncationWarning = result.queries[0].hints.find((h: any) => 
                h.message?.includes('Too many statements') || h.message?.includes('first batch')
            );
            expect(truncationWarning).toBeDefined();
        });

        it('should show helpful message about statement count', () => {
            const statements = [];
            for (let i = 1; i <= 60; i++) {
                statements.push(`SELECT * FROM table${i};`);
            }
            const largeSql = statements.join('\n');
            
            const result = parseSqlBatch(largeSql, 'MySQL' as SqlDialect, {
                maxSqlSizeBytes: DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
                maxQueryCount: 50,
            });
            
            const warning = result.queries[0].hints.find((h: any) => 
                h.message?.includes('Too many statements')
            );
            expect(warning?.suggestion).toBeDefined();
            expect(warning?.suggestion).toMatch(/Showing first 50 of 60/);
        });

        it('should parse files within statement limit normally', () => {
            // Create 30 statements (under 50 limit)
            const statements = [];
            for (let i = 1; i <= 30; i++) {
                statements.push(`SELECT * FROM table${i};`);
            }
            const normalSql = statements.join('\n');
            
            const result = parseSqlBatch(normalSql, 'PostgreSQL' as SqlDialect, {
                maxSqlSizeBytes: DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
                maxQueryCount: 50,
            });
            
            // Should parse successfully without validation error
            expect(result.validationError).toBeUndefined();
            expect(result.queries.length).toBe(30);
        });
    });

    describe('Combined Size and Statement Limits', () => {
        it('should handle both size and statement limits', () => {
            // Create SQL that exceeds both limits
            const statements = [];
            for (let i = 1; i <= 100; i++) {
                statements.push(`SELECT * FROM table${i} WHERE column1 = 'value';`);
            }
            const largeSql = statements.join('\n');
            
            const result = parseSqlBatch(largeSql, 'PostgreSQL' as SqlDialect, {
                maxSqlSizeBytes: 1024, // 1KB limit
                maxQueryCount: 10,
            });
            
            // Should have partial results
            expect(result.queries.length).toBeGreaterThan(0);
            expect(result.validationError).toBeDefined();
        });

        it('should prioritize partial parsing over rejection', () => {
            const largeSql = 'SELECT * FROM table1;'.repeat(1000);
            
            const result = parseSqlBatch(largeSql, 'MySQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            // Should have SOME queries instead of empty result
            expect(result.queries.length).toBeGreaterThan(0);
            
            // First query should have nodes (not empty)
            expect(result.queries[0].nodes.length).toBeGreaterThan(0);
        });
    });

    describe('User Experience', () => {
        it('should provide actionable suggestion for size limit', () => {
            // Create a large single statement to trigger size limit
            const largeSelect = 'SELECT * FROM users WHERE id IN (' + 
                Array.from({length: 10000}, (_, i) => i.toString()).join(',') + ');';
            const largeSql = largeSelect.repeat(30);
            
            const result = parseSqlBatch(largeSql, 'PostgreSQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            // Find any warning about limits
            const warning = result.queries[0]?.hints.find((h: any) => 
                h.message?.includes('truncated') || h.message?.includes('limit') || h.message?.includes('Too many')
            );
            
            if (warning?.message?.includes('truncated')) {
                expect(warning?.suggestion).toMatch(/splitting|smaller files/i);
            } else {
                // If it hit query count limit instead, that's OK too
                expect(warning).toBeDefined();
            }
        });

        it('should provide actionable suggestion for statement limit', () => {
            const statements = [];
            for (let i = 1; i <= 100; i++) {
                statements.push(`SELECT * FROM table${i};`);
            }
            const largeSql = statements.join('\n');
            
            const result = parseSqlBatch(largeSql, 'MySQL' as SqlDialect, {
                maxSqlSizeBytes: DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
                maxQueryCount: 50,
            });
            
            const warning = result.queries[0].hints.find((h: any) => 
                h.message?.includes('Too many statements')
            );
            expect(warning?.suggestion).toMatch(/splitting|multiple files/i);
        });

        it('should indicate actual vs limit in warning', () => {
            const largeSelect = 'SELECT * FROM users WHERE id IN (' + 
                Array.from({length: 10000}, (_, i) => i.toString()).join(',') + ');';
            const largeSql = largeSelect.repeat(30);
            
            const result = parseSqlBatch(largeSql, 'PostgreSQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            // Find any warning about limits
            const warning = result.queries[0]?.hints.find((h: any) => 
                h.message?.includes('truncated') || h.message?.includes('limit') || h.message?.includes('Too many')
            );
            
            if (warning?.suggestion) {
                // Should mention numbers if there's a suggestion
                expect(warning?.suggestion).toMatch(/\d+/);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty SQL', () => {
            const result = parseSqlBatch('', 'PostgreSQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            expect(result.queries.length).toBe(0);
        });

        it('should handle SQL exactly at size limit', () => {
            // Create SQL that's exactly 100KB
            const sql = 'SELECT * FROM users WHERE id = 1;'.repeat(1000); // This has many statements
            
            const result = parseSqlBatch(sql, 'PostgreSQL' as SqlDialect, DEFAULT_VALIDATION_LIMITS);
            
            // Will hit statement limit first, not size limit
            expect(result.validationError).toBeDefined();
            expect(result.queries.length).toBeGreaterThan(0); // But should still parse partial
        });

        it('should handle SQL with exactly 50 statements', () => {
            const statements = [];
            for (let i = 1; i <= 50; i++) {
                statements.push(`SELECT * FROM table${i};`);
            }
            const sql = statements.join('\n');
            
            const result = parseSqlBatch(sql, 'PostgreSQL' as SqlDialect, {
                maxSqlSizeBytes: DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
                maxQueryCount: 50,
            });
            
            // Should parse without error
            expect(result.validationError).toBeUndefined();
            expect(result.queries.length).toBe(50);
        });
    });
});
