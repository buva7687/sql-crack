/**
 * Tests for parser client (async parsing utilities)
 */

import {
    parseAsync,
    parseBatchAsync,
    validateAsync,
    isWorkerSupported,
    terminateWorker,
    parseWithFallback,
    cancelPendingParse,
    getWorkerStatus
} from '../../../src/webview/parserClient';
import { SqlDialect } from '../../../src/webview/types';

describe('parserClient', () => {
    const testSql = `
        SELECT u.name, o.total
        FROM users u
        JOIN orders o ON u.id = o.user_id
        WHERE o.status = 'completed'
    `;

    const multiStatementSql = `
        CREATE TABLE users (id INT, name VARCHAR(100));
        SELECT * FROM users;
        DROP TABLE users;
    `;

    describe('parseAsync', () => {
        it('defers parsing to a macrotask so UI can paint loading states', async () => {
            jest.useFakeTimers();
            try {
                let resolved = false;
                const pending = parseAsync('SELECT 1', 'MySQL').then(() => {
                    resolved = true;
                });

                await Promise.resolve();
                expect(resolved).toBe(false);

                jest.runOnlyPendingTimers();
                await pending;
                expect(resolved).toBe(true);
            } finally {
                jest.useRealTimers();
            }
        });

        it('cancels an older queued parse when a newer parseAsync request starts', async () => {
            jest.useFakeTimers();
            try {
                const olderParse = parseAsync('SELECT 1', 'MySQL');
                const newerParse = parseAsync('SELECT 2', 'MySQL');

                jest.runOnlyPendingTimers();

                const [olderResult, newerResult] = await Promise.all([olderParse, newerParse]);

                expect(olderResult.error).toBe('Parse cancelled');
                expect(newerResult.error).toBeUndefined();
                expect(newerResult.nodes.length).toBeGreaterThan(0);
            } finally {
                jest.useRealTimers();
            }
        });

        it('should parse SQL asynchronously', async () => {
            const result = await parseAsync(testSql, 'MySQL');

            expect(result).toBeDefined();
            expect(result.nodes).toBeInstanceOf(Array);
            expect(result.edges).toBeInstanceOf(Array);
        });

        it('should handle different dialects', async () => {
            const postgresSql = `
                SELECT u.name, o.total
                FROM users u
                JOIN orders o ON u.id = o.user_id
                WHERE o.status = 'completed'
                LIMIT 10
            `;

            const result = await parseAsync(postgresSql, 'PostgreSQL');

            expect(result).toBeDefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle invalid SQL gracefully', async () => {
            const invalidSql = 'SELCT FROM WHERE'; // Invalid SQL

            const result = await parseAsync(invalidSql, 'MySQL');

            // Should return a result, possibly with errors
            expect(result).toBeDefined();
        });

        it('can disable dialect fallback retries', async () => {
            const sql = `SELECT * FROM users WHERE created > INTERVAL '30 days'`;
            const result = await parseAsync(sql, 'MySQL', { allowDialectFallback: false });

            expect(result.partial).toBe(true);
            const retryHint = result.hints.find((hint) => hint.message.includes('Auto-retried parse with PostgreSQL'));
            expect(retryHint).toBeUndefined();
        });

        it('should handle empty SQL', async () => {
            const result = await parseAsync('', 'MySQL');

            expect(result).toBeDefined();
            expect(result.nodes).toEqual([]);
        });

        it('should handle complex SQL with CTEs', async () => {
            const complexSql = `
                WITH monthly_sales AS (
                    SELECT
                        DATE_TRUNC('month', order_date) as month,
                        SUM(total) as monthly_total
                    FROM orders
                    GROUP BY month
                ),
                customer_stats AS (
                    SELECT
                        customer_id,
                        COUNT(*) as order_count,
                        AVG(total) as avg_order_value
                    FROM orders
                    GROUP BY customer_id
                )
                SELECT
                    ms.month,
                    ms.monthly_total,
                    cs.customer_id,
                    cs.order_count
                FROM monthly_sales ms
                CROSS JOIN customer_stats cs
                ORDER BY ms.month, cs.order_count DESC
            `;

            const result = await parseAsync(complexSql, 'PostgreSQL');

            expect(result).toBeDefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('parseBatchAsync', () => {
        it('defers batch parsing to a macrotask so UI can paint loading states', async () => {
            jest.useFakeTimers();
            try {
                let resolved = false;
                const pending = parseBatchAsync('SELECT 1; SELECT 2;', 'MySQL').then(() => {
                    resolved = true;
                });

                await Promise.resolve();
                expect(resolved).toBe(false);

                jest.runOnlyPendingTimers();
                await pending;
                expect(resolved).toBe(true);
            } finally {
                jest.useRealTimers();
            }
        });

        it('cancels an older queued batch parse when a newer parseBatchAsync request starts', async () => {
            jest.useFakeTimers();
            try {
                const olderParse = parseBatchAsync('SELECT 1;', 'MySQL');
                const newerParse = parseBatchAsync('SELECT 2; SELECT 3;', 'MySQL');

                jest.runOnlyPendingTimers();

                const [olderResult, newerResult] = await Promise.all([olderParse, newerParse]);

                expect(olderResult.queries[0]?.error).toBe('Parse cancelled');
                expect(olderResult.parseErrors).toEqual([
                    expect.objectContaining({ message: 'Parse cancelled' }),
                ]);
                expect(newerResult.queries.length).toBeGreaterThan(0);
                expect(newerResult.queries[0]?.error).toBeUndefined();
            } finally {
                jest.useRealTimers();
            }
        });

        it('should parse batch SQL with multiple statements', async () => {
            const result = await parseBatchAsync(multiStatementSql, 'MySQL');

            expect(result).toBeDefined();
            expect(result.queries).toBeInstanceOf(Array);
            expect(result.queries.length).toBeGreaterThan(0);
        });

        it('should handle single statement batch', async () => {
            const result = await parseBatchAsync(testSql, 'MySQL');

            expect(result).toBeDefined();
            expect(result.queries.length).toBeGreaterThanOrEqual(1);
        });

        it('should track statement counts', async () => {
            const result = await parseBatchAsync(multiStatementSql, 'MySQL');

            expect(result.queries.length).toBeGreaterThan(0);
            expect(result.successCount ?? 0).toBeLessThanOrEqual(result.queries.length);
        });

        it('should report errors for failed statements', async () => {
            const sqlWithErrors = `
                SELECT * FROM valid_table;
                SELCT FROM invalid_table;
                SELECT * FROM another_valid_table;
            `;

            const result = await parseBatchAsync(sqlWithErrors, 'MySQL');

            expect(result).toBeDefined();
            // Some statements should succeed, some should fail
            expect(result.queries.length).toBeGreaterThan(0);
        });
    });

    describe('validateAsync', () => {
        it('defers validation to a macrotask so UI can paint loading states', async () => {
            jest.useFakeTimers();
            try {
                let resolved = false;
                const pending = validateAsync('SELECT 1').then(() => {
                    resolved = true;
                });

                await Promise.resolve();
                expect(resolved).toBe(false);

                jest.runOnlyPendingTimers();
                await pending;
                expect(resolved).toBe(true);
            } finally {
                jest.useRealTimers();
            }
        });

        it('should validate normal SQL without errors', async () => {
            const error = await validateAsync(testSql);

            expect(error).toBeNull();
        });

        it('should detect oversized SQL', async () => {
            const hugeSql = 'SELECT * FROM users;'.repeat(10000); // Very large

            const error = await validateAsync(hugeSql, 1000); // 1KB limit

            expect(error).toBeDefined();
            expect(error?.type).toBe('size_limit');
        });

        it('should detect too many statements', async () => {
            const manyStatements = 'SELECT 1;'.repeat(100);

            const error = await validateAsync(manyStatements, undefined, 50);

            expect(error).toBeDefined();
            expect(error?.type).toBe('query_count_limit');
        });

        it('should allow custom limits', async () => {
            const largeSql = testSql.repeat(100);

            // Should pass with higher limit
            const error1 = await validateAsync(largeSql, 1000000);
            expect(error1).toBeNull();

            // Should fail with lower limit
            const error2 = await validateAsync(largeSql, 100);
            expect(error2).toBeDefined();
        });

        it('should handle empty SQL', async () => {
            const error = await validateAsync('');

            expect(error).toBeDefined();
        });
    });

    describe('isWorkerSupported', () => {
        it('should return false (worker implementation deferred)', () => {
            const supported = isWorkerSupported();

            expect(supported).toBe(false);
        });
    });

    describe('terminateWorker', () => {
        it('should be a no-op (worker implementation deferred)', () => {
            expect(() => terminateWorker()).not.toThrow();
        });

        it('should be safe to call multiple times', () => {
            terminateWorker();
            terminateWorker();
            terminateWorker();

            expect(true).toBe(true); // Should not throw
        });
    });

    describe('parseWithFallback', () => {
        it('should parse SQL successfully', async () => {
            const result = await parseWithFallback(testSql, 'MySQL', true);

            expect(result).toBeDefined();
            expect(result.nodes).toBeInstanceOf(Array);
        });

        it('should work with useWorker=false', async () => {
            // Worker implementation deferred, should still work
            const result = await parseWithFallback(testSql, 'MySQL', false);

            expect(result).toBeDefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle errors gracefully', async () => {
            const invalidSql = 'INVALID SQL HERE';

            const result = await parseWithFallback(invalidSql, 'MySQL', true);

            // Should not throw, should return some result
            expect(result).toBeDefined();
        });
    });

    describe('cancelPendingParse', () => {
        it('should cancel without error', () => {
            expect(() => cancelPendingParse()).not.toThrow();
        });

        it('should be safe to call when no parse is pending', () => {
            cancelPendingParse();
            cancelPendingParse();

            expect(true).toBe(true); // Should not throw
        });

        it('cancels a queued parse before synchronous parsing starts', async () => {
            jest.useFakeTimers();
            try {
                const pending = parseAsync('SELECT 1', 'MySQL');
                cancelPendingParse();

                jest.runOnlyPendingTimers();

                const result = await pending;
                expect(result.error).toBe('Parse cancelled');
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('getWorkerStatus', () => {
        it('should return worker status with deferred implementation', () => {
            const status = getWorkerStatus();

            expect(status).toHaveProperty('supported');
            expect(status).toHaveProperty('active');
            expect(status).toHaveProperty('pendingRequests');
            expect(status).toHaveProperty('implementation');
            expect(status.supported).toBe(false);
            expect(status.active).toBe(false);
            expect(status.pendingRequests).toBe(0);
            expect(status.implementation).toBe('deferred');
        });

        it('should reflect deferred implementation', () => {
            terminateWorker();

            const status = getWorkerStatus();
            expect(status.active).toBe(false);
            expect(status.implementation).toBe('deferred');
        });

        it('tracks queued parse requests while waiting on the macrotask boundary', async () => {
            jest.useFakeTimers();
            try {
                const pending = parseAsync('SELECT 1', 'MySQL');

                expect(getWorkerStatus().pendingRequests).toBeGreaterThanOrEqual(1);

                jest.runOnlyPendingTimers();
                await pending;

                expect(getWorkerStatus().pendingRequests).toBe(0);
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('edge cases', () => {
        it('should handle SQL with special characters', async () => {
            const specialSql = `
                SELECT "quoted string", 'another string'
                FROM table_name
                WHERE col = 'value with ; semicolon'
            `;

            const result = await parseAsync(specialSql, 'MySQL');

            expect(result).toBeDefined();
        });

        it('should handle SQL with comments', async () => {
            const sqlWithComments = `
                -- This is a comment
                SELECT * FROM users;
                /* Multi-line
                   comment */
                SELECT * FROM orders;
            `;

            const result = await parseAsync(sqlWithComments, 'MySQL');

            expect(result).toBeDefined();
        });

        it('should handle very long single line', async () => {
            const longLine = `SELECT ${'col1, '.repeat(100)}col100 FROM very_long_table_name;`;

            const result = await parseAsync(longLine, 'MySQL');

            expect(result).toBeDefined();
        });

        it('should handle SQL with window functions', async () => {
            const windowSql = `
                SELECT
                    employee_id,
                    salary,
                    ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) as rank
                FROM employees
            `;

            const result = await parseAsync(windowSql, 'PostgreSQL');

            expect(result).toBeDefined();
            expect(result.nodes.length).toBeGreaterThan(0);
        });

        it('should handle SQL with CASE statements', async () => {
            const caseSql = `
                SELECT
                    product_id,
                    quantity,
                    CASE
                        WHEN quantity > 100 THEN 'High'
                        WHEN quantity > 50 THEN 'Medium'
                        ELSE 'Low'
                    END as quantity_category
                FROM products
            `;

            const result = await parseAsync(caseSql, 'MySQL');

            expect(result).toBeDefined();
        });
    });
});
