/**
 * Performance Baseline Benchmarks for Refactoring
 *
 * These tests establish performance baselines for parsing and rendering.
 * During refactoring, run these to ensure no performance regressions.
 *
 * Run with: npx jest tests/webview/perfBaseline.test.ts --verbose
 *
 * NOTE: These are timing baselines, not strict pass/fail tests.
 * They document current performance for comparison during refactoring.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseSqlBatch, parseSql, DEFAULT_VALIDATION_LIMITS } from '../../src/webview/sqlParser';

// Read the fixture file with 20 diverse queries
const fixturePath = path.join(__dirname, '../fixtures/refactor/diverse-queries.sql');
const fixtureSql = fs.readFileSync(fixturePath, 'utf-8');

// Performance thresholds (in milliseconds) - these are upper bounds
// If parsing takes longer than these, there may be a regression
const THRESHOLDS = {
    singleSimpleQuery: 50,      // Simple SELECT should be < 50ms
    singleComplexQuery: 200,    // Complex CTE query should be < 200ms
    batch20Queries: 1000,       // Full batch of 20 queries should be < 1s
    batchMemoryMB: 50,          // Memory usage should be < 50MB
};

describe('Performance Baseline - Parsing Speed', () => {
    describe('Single Query Performance', () => {
        it('should parse simple SELECT in < 50ms', () => {
            const simpleSql = 'SELECT id, name FROM users WHERE status = \'active\'';

            // Warm-up run to avoid cold-start parser initialization noise.
            parseSql(simpleSql, 'MySQL');

            let result = parseSql(simpleSql, 'MySQL');
            const durations: number[] = [];
            for (let i = 0; i < 3; i += 1) {
                const start = performance.now();
                result = parseSql(simpleSql, 'MySQL');
                durations.push(performance.now() - start);
            }
            const duration = Math.min(...durations);

            expect(result.error).toBeUndefined();
            expect(duration).toBeLessThan(THRESHOLDS.singleSimpleQuery);
            
            console.log(`  ✓ Simple SELECT: ${duration.toFixed(2)}ms (threshold: ${THRESHOLDS.singleSimpleQuery}ms)`);
        });

        it('should parse simple JOIN in < 50ms', () => {
            const joinSql = `
                SELECT u.name, o.total
                FROM users u
                JOIN orders o ON u.id = o.user_id
                WHERE o.status = 'completed'
            `;
            
            const start = performance.now();
            const result = parseSql(joinSql, 'MySQL');
            const duration = performance.now() - start;
            
            expect(result.error).toBeUndefined();
            expect(duration).toBeLessThan(THRESHOLDS.singleSimpleQuery);
            
            console.log(`  ✓ Simple JOIN: ${duration.toFixed(2)}ms (threshold: ${THRESHOLDS.singleSimpleQuery}ms)`);
        });

        it('should parse simple CTE in < 100ms', () => {
            const cteSql = `
                WITH active_users AS (
                    SELECT * FROM users WHERE status = 'active'
                )
                SELECT * FROM active_users
            `;
            
            const start = performance.now();
            const result = parseSql(cteSql, 'PostgreSQL');
            const duration = performance.now() - start;
            
            expect(result.error).toBeUndefined();
            expect(duration).toBeLessThan(100);
            
            console.log(`  ✓ Simple CTE: ${duration.toFixed(2)}ms (threshold: 100ms)`);
        });
    });

    describe('Complex Query Performance', () => {
        it('should parse complex multi-CTE query in < 200ms', () => {
            // Extract the complex query from fixture (Query 20)
            const complexMatch = fixtureSql.match(/-- QUERY 20:[\s\S]*?(?=-- =|$)/);
            const complexSql = complexMatch ? complexMatch[0] : '';
            
            if (!complexSql) {
                console.log('  ⊘ Complex query not found in fixture - skipping');
                return;
            }
            
            const start = performance.now();
            const result = parseSql(complexSql, 'PostgreSQL');
            const duration = performance.now() - start;
            
            expect(result.error).toBeUndefined();
            expect(duration).toBeLessThan(THRESHOLDS.singleComplexQuery);
            
            console.log(`  ✓ Complex multi-CTE: ${duration.toFixed(2)}ms (threshold: ${THRESHOLDS.singleComplexQuery}ms)`);
        });

        it('should parse large batch efficiently', () => {
            // Create a batch of 10 copies of a medium query
            const mediumQuery = `
                SELECT 
                    u.id, u.name, u.email,
                    COUNT(o.id) as order_count,
                    SUM(o.total) as total_spent
                FROM users u
                LEFT JOIN orders o ON u.id = o.user_id
                WHERE u.created_at > '2024-01-01'
                GROUP BY u.id, u.name, u.email
                HAVING COUNT(o.id) > 0
                ORDER BY total_spent DESC
            `;
            const batchSql = Array(10).fill(mediumQuery).join(';\n');
            
            const start = performance.now();
            const result = parseSqlBatch(batchSql, 'PostgreSQL', DEFAULT_VALIDATION_LIMITS, {});
            const duration = performance.now() - start;
            
            expect(result.queries.length).toBe(10);
            expect(duration).toBeLessThan(500); // 10 queries should be < 500ms
            
            console.log(`  ✓ Batch of 10 medium queries: ${duration.toFixed(2)}ms`);
        });
    });

    describe('Full Fixture Performance', () => {
        it('should parse all 20 fixture queries in < 1s', () => {
            const start = performance.now();
            const result = parseSqlBatch(fixtureSql, 'PostgreSQL', DEFAULT_VALIDATION_LIMITS, {});
            const duration = performance.now() - start;
            
            const successCount = result.queries.filter(q => !q.error).length;
            const successRate = successCount / result.queries.length;
            
            expect(successRate).toBeGreaterThanOrEqual(0.7); // 70%+ should parse
            expect(duration).toBeLessThan(THRESHOLDS.batch20Queries);
            
            console.log(`  ✓ Full fixture (${result.queries.length} queries): ${duration.toFixed(2)}ms`);
            console.log(`    Success rate: ${(successRate * 100).toFixed(1)}% (${successCount}/${result.queries.length})`);
        });

        it('should track per-query timing for regression detection', () => {
            // Split fixture into individual queries and time each
            const queries = fixtureSql
                .split(/-- =+\n-- QUERY \d+:/)
                .filter(q => q.trim().length > 0);
            
            const timings: { index: number; duration: number; hasError: boolean }[] = [];
            
            queries.forEach((query, index) => {
                const start = performance.now();
                const result = parseSql(query.trim(), 'PostgreSQL');
                const duration = performance.now() - start;
                
                timings.push({
                    index: index + 1,
                    duration,
                    hasError: !!result.error
                });
            });
            
            // Log all timings for documentation
            console.log('\n  Per-query timings:');
            timings.forEach(t => {
                const status = t.hasError ? '⚠' : '✓';
                console.log(`    Query ${t.index.toString().padStart(2)}: ${t.duration.toFixed(2).padStart(7)}ms ${status}`);
            });
            
            // Find slowest query
            const slowest = timings.reduce((a, b) => a.duration > b.duration ? a : b);
            console.log(`\n  Slowest: Query ${slowest.index} at ${slowest.duration.toFixed(2)}ms`);
            
            // All queries should complete within reasonable time
            const slowQueries = timings.filter(t => t.duration > 500);
            expect(slowQueries.length).toBe(0);
        });
    });
});

describe('Performance Baseline - Memory Usage', () => {
    it('should not leak memory during repeated parsing', () => {
        // Force garbage collection if available (run with --expose-gc)
        if (global.gc) {
            global.gc();
        }
        
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Parse the fixture 10 times
        for (let i = 0; i < 10; i++) {
            parseSqlBatch(fixtureSql, 'PostgreSQL', DEFAULT_VALIDATION_LIMITS, {});
        }
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncreaseMB = (finalMemory - initialMemory) / (1024 * 1024);
        
        console.log(`  Memory increase after 10 parses: ${memoryIncreaseMB.toFixed(2)}MB`);
        
        // Memory should not grow significantly (allow some variance)
        expect(memoryIncreaseMB).toBeLessThan(THRESHOLDS.batchMemoryMB);
    });
});

describe('Performance Baseline - Dialect Comparison', () => {
    const dialects = ['MySQL', 'PostgreSQL', 'Snowflake', 'BigQuery'] as const;
    
    dialects.forEach(dialect => {
        it(`should parse fixture with ${dialect} dialect in < 1.5s`, () => {
            const start = performance.now();
            const result = parseSqlBatch(fixtureSql, dialect, DEFAULT_VALIDATION_LIMITS, {});
            const duration = performance.now() - start;
            
            const successCount = result.queries.filter(q => !q.error).length;
            
            console.log(`  ✓ ${dialect}: ${duration.toFixed(2)}ms, ${successCount}/${result.queries.length} parsed`);
            
            expect(duration).toBeLessThan(1500);
        });
    });
});

describe('Performance Regression Summary', () => {
    it('should document baseline metrics', () => {
        // Run a comprehensive benchmark and document results
        const metrics = {
            timestamp: new Date().toISOString(),
            nodeVersion: process.version,
            platform: process.platform,
            simpleQueryMs: 0,
            complexQueryMs: 0,
            batch20QueriesMs: 0,
        };
        
        // Simple query
        const simpleStart = performance.now();
        parseSql('SELECT * FROM users', 'MySQL');
        metrics.simpleQueryMs = performance.now() - simpleStart;
        
        // Complex query (from fixture)
        const complexMatch = fixtureSql.match(/-- QUERY 20:[\s\S]*?(?=-- =|$)/);
        if (complexMatch) {
            const complexStart = performance.now();
            parseSql(complexMatch[0], 'PostgreSQL');
            metrics.complexQueryMs = performance.now() - complexStart;
        }
        
        // Batch
        const batchStart = performance.now();
        parseSqlBatch(fixtureSql, 'PostgreSQL', DEFAULT_VALIDATION_LIMITS, {});
        metrics.batch20QueriesMs = performance.now() - batchStart;
        
        console.log('\n========================================');
        console.log('PERFORMANCE BASELINE SUMMARY');
        console.log('========================================');
        console.log(`Timestamp: ${metrics.timestamp}`);
        console.log(`Node: ${metrics.nodeVersion}`);
        console.log(`Platform: ${metrics.platform}`);
        console.log('----------------------------------------');
        console.log(`Simple Query:   ${metrics.simpleQueryMs.toFixed(2)}ms`);
        console.log(`Complex Query:  ${metrics.complexQueryMs.toFixed(2)}ms`);
        console.log(`Batch (20):     ${metrics.batch20QueriesMs.toFixed(2)}ms`);
        console.log('========================================\n');
        
        // This test always passes - it's just for documentation
        expect(true).toBe(true);
    });
});
