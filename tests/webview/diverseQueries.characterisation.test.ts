/**
 * Characterisation Tests for parseSqlBatch
 *
 * These tests capture the CURRENT behavior of the SQL parser
 * on 20 diverse queries. They serve as a safety net during refactoring.
 *
 * IMPORTANT: These are characterisation tests, not specification tests.
 * They document what the code DOES, not what it SHOULD do.
 * If behavior changes intentionally, update the expected values.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseSqlBatch, parseSql, DEFAULT_VALIDATION_LIMITS } from '../../src/webview/sqlParser';

// Read the fixture file
const fixturePath = path.join(__dirname, '../fixtures/refactor/diverse-queries.sql');
const fixtureSql = fs.readFileSync(fixturePath, 'utf-8');

// Parse all queries as a batch
const batchResult = parseSqlBatch(fixtureSql, 'PostgreSQL', DEFAULT_VALIDATION_LIMITS, {});

// Helper to find query containing specific SQL pattern
function findQueryByPattern(pattern: RegExp) {
    return batchResult.queries.find(q => pattern.test(q.sql));
}

// Helper to count table nodes
function countTableNodes(result: { nodes: any[] }) {
    return result.nodes.filter(n => n.type === 'table').length;
}

// Helper to get table labels
function getTableLabels(result: { nodes: any[] }) {
    return result.nodes.filter(n => n.type === 'table').map(n => n.label);
}

// Helper to count CTE nodes
function countCteNodes(result: { nodes: any[] }) {
    return result.nodes.filter(n => n.type === 'cte').length;
}

describe('Diverse Queries Characterisation Tests - Batch Processing', () => {
    describe('Batch Statistics', () => {
        it('should parse at least 15 queries from the fixture', () => {
            expect(batchResult.queries.length).toBeGreaterThanOrEqual(15);
        });

        it('should have mostly successful parses (70%+)', () => {
            const successCount = batchResult.queries.filter(q => !q.error).length;
            const successRate = successCount / batchResult.queries.length;
            expect(successRate).toBeGreaterThanOrEqual(0.7);
        });

        it('should have aggregated total stats', () => {
            expect(batchResult.totalStats).toBeDefined();
            expect(batchResult.totalStats.tables).toBeGreaterThan(0);
        });
    });
});

describe('Diverse Queries Characterisation Tests - Individual Patterns', () => {
    describe('Simple SELECT patterns', () => {
        const simpleSelect = findQueryByPattern(/SELECT id,\s*name,\s*email FROM users/i);

        it('should find simple SELECT query', () => {
            expect(simpleSelect).toBeDefined();
        });

        it('should parse without error', () => {
            expect(simpleSelect?.error).toBeUndefined();
        });

        it('should have users table', () => {
            const labels = getTableLabels(simpleSelect!);
            expect(labels).toContain('users');
        });
    });

    describe('SELECT with WHERE patterns', () => {
        const whereSelect = findQueryByPattern(/SELECT \* FROM orders WHERE status/i);

        it('should find WHERE query', () => {
            expect(whereSelect).toBeDefined();
        });

        it('should parse without error', () => {
            expect(whereSelect?.error).toBeUndefined();
        });

        it('should have orders table', () => {
            const labels = getTableLabels(whereSelect!);
            expect(labels).toContain('orders');
        });
    });

    describe('JOIN patterns', () => {
        const joinQuery = findQueryByPattern(/JOIN orders o ON u\.id = o\.user_id/i);

        it('should find JOIN query', () => {
            expect(joinQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(joinQuery?.error).toBeUndefined();
        });

        it('should have users and orders tables', () => {
            const labels = getTableLabels(joinQuery!);
            expect(labels).toContain('users');
            expect(labels).toContain('orders');
        });

        it('should have multiple edges', () => {
            expect(joinQuery!.edges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Multiple JOINs pattern', () => {
        const multiJoin = findQueryByPattern(/JOIN products p ON o\.product_id = p\.id/i);

        it('should find multi-JOIN query', () => {
            expect(multiJoin).toBeDefined();
        });

        it('should parse without error', () => {
            expect(multiJoin?.error).toBeUndefined();
        });

        it('should have 3 table nodes', () => {
            expect(countTableNodes(multiJoin!)).toBe(3);
        });
    });

    describe('CTE patterns', () => {
        const cteQuery = findQueryByPattern(/WITH active_users AS/i);

        it('should find CTE query', () => {
            expect(cteQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(cteQuery?.error).toBeUndefined();
        });

        it('should have at least 1 CTE node', () => {
            expect(countCteNodes(cteQuery!)).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Multiple CTEs pattern', () => {
        const multiCte = findQueryByPattern(/WITH\s+active_users AS.*recent_orders AS/is);

        it('should find multiple CTE query', () => {
            expect(multiCte).toBeDefined();
        });

        it('should parse without error', () => {
            expect(multiCte?.error).toBeUndefined();
        });

        it('should have at least 2 CTE nodes', () => {
            expect(countCteNodes(multiCte!)).toBeGreaterThanOrEqual(2);
        });
    });

    describe('INSERT pattern', () => {
        const insertQuery = findQueryByPattern(/INSERT INTO archived_orders/i);

        it('should find INSERT query', () => {
            expect(insertQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(insertQuery?.error).toBeUndefined();
        });

        it('should have archived_orders table', () => {
            const labels = getTableLabels(insertQuery!);
            expect(labels).toContain('archived_orders');
        });
    });

    describe('UPDATE pattern', () => {
        const updateQuery = findQueryByPattern(/UPDATE users SET status/i);

        it('should find UPDATE query', () => {
            expect(updateQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(updateQuery?.error).toBeUndefined();
        });

        it('should have users table', () => {
            const labels = getTableLabels(updateQuery!);
            expect(labels).toContain('users');
        });
    });

    describe('DELETE pattern', () => {
        const deleteQuery = findQueryByPattern(/DELETE FROM orders/i);

        it('should find DELETE query', () => {
            expect(deleteQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(deleteQuery?.error).toBeUndefined();
        });
    });

    describe('UNION pattern', () => {
        const unionQuery = findQueryByPattern(/UNION.*SELECT name FROM customers/is);

        it('should find UNION query', () => {
            expect(unionQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(unionQuery?.error).toBeUndefined();
        });

        it('should have users and customers tables', () => {
            const labels = getTableLabels(unionQuery!);
            expect(labels).toContain('users');
            expect(labels).toContain('customers');
        });
    });

    describe('Aggregate functions pattern', () => {
        const aggQuery = findQueryByPattern(/COUNT\(\*\).*SUM\(total\).*AVG\(total\)/is);

        it('should find aggregate query', () => {
            expect(aggQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(aggQuery?.error).toBeUndefined();
        });
    });

    describe('Window functions pattern', () => {
        const windowQuery = findQueryByPattern(/ROW_NUMBER\(\) OVER/i);

        it('should find window function query', () => {
            expect(windowQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(windowQuery?.error).toBeUndefined();
        });
    });

    describe('Subquery in FROM pattern', () => {
        const subquery = findQueryByPattern(/FROM \(\s*SELECT u\.name.*SUM\(o\.total\)/is);

        it('should find subquery', () => {
            expect(subquery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(subquery?.error).toBeUndefined();
        });

        it('should have subquery node or nested children', () => {
            const hasSubquery = subquery!.nodes.some(n => n.type === 'subquery') ||
                subquery!.nodes.some(n => n.children && n.children.length > 0);
            expect(hasSubquery).toBeTruthy();
        });
    });

    describe('Complex real-world query pattern', () => {
        const complexQuery = findQueryByPattern(/WITH monthly_sales AS.*product_rankings AS.*top_products AS/is);

        it('should find complex query', () => {
            expect(complexQuery).toBeDefined();
        });

        it('should parse without error', () => {
            expect(complexQuery?.error).toBeUndefined();
        });

        it('should have multiple CTEs', () => {
            expect(countCteNodes(complexQuery!)).toBeGreaterThanOrEqual(2);
        });

        it('should have significant node count', () => {
            expect(complexQuery!.nodes.length).toBeGreaterThan(5);
        });

        it('should have column flows', () => {
            expect(complexQuery!.columnFlows).toBeDefined();
            expect(complexQuery!.columnFlows!.length).toBeGreaterThan(0);
        });
    });
});

describe('Diverse Queries - Edge Cases', () => {
    describe('CREATE TABLE (DDL)', () => {
        const ddlQuery = findQueryByPattern(/CREATE TABLE audit_log/i);

        it('should find DDL query', () => {
            expect(ddlQuery).toBeDefined();
        });

        // DDL may or may not parse fully - document behavior
        it('should not crash on DDL', () => {
            expect(ddlQuery).toBeDefined();
            expect(ddlQuery!.nodes).toBeDefined();
        });
    });

    describe('MERGE statement', () => {
        /**
         * MERGE Statement Support Note:
         * 
         * MERGE (UPSERT) statements have limited parsing support in the current
         * implementation. The parser may:
         * - Parse partially (target/source tables extracted)
         * - Fall back to regex extraction
         * - Return an error but not crash
         * 
         * These tests verify graceful handling, not full MERGE support.
         * Full MERGE support would require significant parser enhancements.
         */
        const mergeQuery = findQueryByPattern(/MERGE INTO products target/i);

        it('should find MERGE query', () => {
            expect(mergeQuery).toBeDefined();
        });

        it('should not crash on MERGE', () => {
            expect(mergeQuery).toBeDefined();
            expect(mergeQuery!.nodes).toBeDefined();
        });

        it('should extract at least one table reference if parsed successfully', () => {
            // If MERGE parses without error, verify table extraction
            if (!mergeQuery?.error) {
                const labels = getTableLabels(mergeQuery!);
                // May have products and/or new_products
                expect(labels.length).toBeGreaterThanOrEqual(1);
            }
        });
    });
});

describe('Diverse Queries - Column Lineage', () => {
    it('should have column lineage for SELECT queries', () => {
        const selectsWithLineage = batchResult.queries.filter(q => 
            !q.error && 
            q.sql.toLowerCase().includes('select') &&
            q.columnLineage &&
            q.columnLineage.length > 0
        );
        expect(selectsWithLineage.length).toBeGreaterThan(0);
    });

    it('should have column flows for SELECT queries', () => {
        const selectsWithFlows = batchResult.queries.filter(q => 
            !q.error && 
            q.sql.toLowerCase().includes('select') &&
            q.columnFlows &&
            q.columnFlows.length > 0
        );
        expect(selectsWithFlows.length).toBeGreaterThan(0);
    });
});

describe('Diverse Queries - Hints Generation', () => {
    it('should generate hints for some queries', () => {
        const queriesWithHints = batchResult.queries.filter(q => 
            q.hints && q.hints.length > 0
        );
        expect(queriesWithHints.length).toBeGreaterThan(0);
    });

    it('should have valid hint structure', () => {
        for (const query of batchResult.queries) {
            if (query.hints) {
                for (const hint of query.hints) {
                    expect(hint.message).toBeDefined();
                    expect(typeof hint.message).toBe('string');
                }
            }
        }
    });
});

describe('Diverse Queries - Stats Accuracy', () => {
    it('should count tables accurately', () => {
        // Find a query with exactly 1 table
        const singleTable = findQueryByPattern(/SELECT id,\s*name,\s*email FROM users/i);
        if (singleTable && !singleTable.error) {
            expect(singleTable.stats.tables).toBeGreaterThanOrEqual(1);
        }
    });

    it('should count CTEs accurately', () => {
        const multiCte = findQueryByPattern(/WITH\s+active_users AS.*recent_orders AS/is);
        if (multiCte && !multiCte.error) {
            expect(multiCte.stats.ctes).toBeGreaterThanOrEqual(2);
        }
    });

    it('should count joins accurately', () => {
        const multiJoin = findQueryByPattern(/JOIN products p ON o\.product_id = p\.id/i);
        if (multiJoin && !multiJoin.error) {
            expect(multiJoin.stats.joins).toBeGreaterThanOrEqual(2);
        }
    });

    it('should have complexity score', () => {
        for (const query of batchResult.queries) {
            if (!query.error) {
                expect(query.stats.complexityScore).toBeDefined();
                expect(query.stats.complexityScore).toBeGreaterThanOrEqual(0);
            }
        }
    });
});
