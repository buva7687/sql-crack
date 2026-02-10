/**
 * E2E Tests for demo-showcase.sql
 *
 * Tests parsing of all query types (SELECT, UPDATE, INSERT, DELETE)
 * and verifies column lineage is correctly generated/reset between queries.
 *
 * This test ensures:
 * 1. Multiple queries in demo-showcase.sql parse without critical errors
 * 2. SELECT queries have column flows generated
 * 3. UPDATE/INSERT/DELETE queries have empty column flows
 * 4. Query switching properly resets state
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseSqlBatch, DEFAULT_VALIDATION_LIMITS } from '../../src/webview/sqlParser';

describe('Demo Showcase E2E Tests', () => {
    let demoSql: string;
    let result: ReturnType<typeof parseSqlBatch>;

    beforeAll(() => {
        const demoPath = path.join(__dirname, '../../examples/demo-showcase.sql');
        demoSql = fs.readFileSync(demoPath, 'utf-8');
        result = parseSqlBatch(demoSql, 'PostgreSQL', DEFAULT_VALIDATION_LIMITS, {});
    });

    describe('Snowflake write-query compatibility', () => {
        it('parses QUERY 8 DELETE statement without Snowflake near-W failure', () => {
            const snowflakeResult = parseSqlBatch(demoSql, 'Snowflake', DEFAULT_VALIDATION_LIMITS, {});
            const deleteQuery = snowflakeResult.queries.find(q =>
                /DELETE\s+FROM\s+test_orders/i.test(q.sql)
            );

            expect(deleteQuery).toBeDefined();
            expect(deleteQuery?.error).toBeUndefined();
            expect(deleteQuery?.nodes.some(n => n.label === 'DELETE')).toBe(true);
        });
    });

    describe('Batch Parsing', () => {
        it('should parse multiple queries', () => {
            // demo-showcase.sql has multiple queries (9+ depending on how semicolons are handled)
            expect(result.queries.length).toBeGreaterThanOrEqual(9);
        });

        it('should have mostly successful parses', () => {
            // Most queries should parse without errors
            const successRate = (result.queries.length - (result.errorCount || 0)) / result.queries.length;
            expect(successRate).toBeGreaterThanOrEqual(0.8);
        });

        it('should have SELECT queries with nodes', () => {
            // Find queries that have SELECT nodes
            const selectQueries = result.queries.filter(q =>
                q.nodes.some(n => n.type === 'select')
            );
            // Should have multiple SELECT queries
            expect(selectQueries.length).toBeGreaterThanOrEqual(5);
        });
    });

    describe('Column Flows', () => {
        it('SELECT queries should have column flows', () => {
            // Find SELECT queries with column flows
            const selectQueriesWithFlows = result.queries.filter(q =>
                q.nodes.some(n => n.type === 'select') &&
                q.columnFlows &&
                q.columnFlows.length > 0
            );
            // At least some SELECT queries should have column flows
            expect(selectQueriesWithFlows.length).toBeGreaterThan(0);
        });

        it('non-SELECT queries should have empty or no column flows', () => {
            // Find queries without SELECT nodes (UPDATE, INSERT, DELETE)
            const nonSelectQueries = result.queries.filter(q =>
                !q.nodes.some(n => n.type === 'select')
            );

            // Each non-SELECT query should have no column flows
            for (const query of nonSelectQueries) {
                const hasNoFlows = !query.columnFlows || query.columnFlows.length === 0;
                expect(hasNoFlows).toBe(true);
            }
        });

        it('column flows should be different for different SELECT queries', () => {
            // Find two SELECT queries with column flows
            const selectQueriesWithFlows = result.queries.filter(q =>
                q.nodes.some(n => n.type === 'select') &&
                q.columnFlows &&
                q.columnFlows.length > 0
            );

            if (selectQueriesWithFlows.length >= 2) {
                const q1Flows = selectQueriesWithFlows[0].columnFlows!;
                const q2Flows = selectQueriesWithFlows[1].columnFlows!;

                const q1Outputs = q1Flows.map(f => f.outputColumn).sort();
                const q2Outputs = q2Flows.map(f => f.outputColumn).sort();

                // They shouldn't be identical (different queries have different outputs)
                expect(JSON.stringify(q1Outputs)).not.toBe(JSON.stringify(q2Outputs));
            }
        });

        it('Q1 customer lifecycle lineage should keep real output names (no expr fallbacks)', () => {
            const query1 = result.queries.find(q =>
                /FROM\s+customer_segments\s+cs/i.test(q.sql) &&
                /JOIN\s+regional_metrics\s+rm/i.test(q.sql)
            );

            expect(query1).toBeDefined();
            const outputColumns = (query1?.columnFlows || []).map(f => f.outputColumn.toLowerCase());

            expect(outputColumns).toEqual(expect.arrayContaining([
                'customer_id',
                'customer_name',
                'regional_customer_count',
                'revenue_contribution_pct',
                'contact_email',
                'avg_customer_value'
            ]));
            expect(outputColumns.filter(name => name === 'expr')).toHaveLength(0);
        });
    });

    describe('Query Complexity', () => {
        it('should detect CTEs in queries', () => {
            // Find queries with CTEs
            const queriesWithCTEs = result.queries.filter(q => q.stats.ctes > 0);
            expect(queriesWithCTEs.length).toBeGreaterThan(0);
        });

        it('should detect JOINs in queries', () => {
            // Find queries with JOINs
            const queriesWithJoins = result.queries.filter(q => q.stats.joins > 0);
            expect(queriesWithJoins.length).toBeGreaterThan(0);
        });

        it('should detect UNIONs in queries', () => {
            // Find queries with UNIONs
            const queriesWithUnions = result.queries.filter(q => q.stats.unions > 0);
            expect(queriesWithUnions.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('handles invalid SQL in batch with fallback parser', () => {
            const brokenSql = `SELECT 1;
SELECT
  customer_id
FROOM orders;`;
            const broken = parseSqlBatch(brokenSql, 'Snowflake', DEFAULT_VALIDATION_LIMITS, {});

            // With fallback parser, invalid SQL produces partial results
            expect(broken.queries.length).toBe(2);
            // The second query should be marked as partial
            expect(broken.queries[1].partial).toBe(true);
        });

        it('should handle queries with window functions', () => {
            // Check if any query has window function stats or window nodes
            const hasWindowFunctions = result.queries.some(q =>
                q.stats.windowFunctions > 0 ||
                q.nodes.some(n => n.type === 'window')
            );
            expect(hasWindowFunctions).toBe(true);
        });

        it('should parse complex nested queries', () => {
            // Check that the parser handles complex queries without crashing
            // The demo-showcase.sql has correlated subqueries and nested selects
            // Even if they're not tracked as 'subquery' nodes, they should parse
            const complexQueries = result.queries.filter(q =>
                q.nodes.length > 5 || q.stats.tables > 2
            );
            expect(complexQueries.length).toBeGreaterThan(0);
        });

        it('should handle queries with CASE statements', () => {
            // Check if any query has CASE nodes
            const hasCase = result.queries.some(q =>
                q.nodes.some(n => n.type === 'case' || n.caseDetails)
            );
            expect(hasCase).toBe(true);
        });
    });
});
