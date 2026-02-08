/**
 * Item #4: Parser Timeout Protection
 *
 * Tests that the parser measures parse time, warns when approaching the
 * timeout threshold, and falls back to the regex parser when exceeded.
 */

import { parseSql, setParseTimeout, PARSE_TIMEOUT_MS } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

// We mock Date.now to simulate slow parsing without actually waiting.
// The parser calls Date.now() before and after astify — by advancing the
// clock between those two calls we can deterministically trigger the threshold.

describe('Item #4: Parser Timeout Protection', () => {
    afterEach(() => {
        // Restore default timeout after every test
        setParseTimeout();
        jest.restoreAllMocks();
    });

    // ── Helper ────────────────────────────────────────────────────────
    // Advances Date.now by `delayMs` on its second invocation (the one
    // recorded AFTER parser.astify completes).
    function mockSlowParse(delayMs: number): void {
        const realNow = Date.now;
        let calls = 0;
        jest.spyOn(Date, 'now').mockImplementation(() => {
            calls++;
            // First call: real time (start stamp)
            // Second call: real time + delay (end stamp)
            if (calls <= 1) {
                return realNow.call(Date);
            }
            return realNow.call(Date) + delayMs;
        });
    }

    // ── Normal queries — no warnings ─────────────────────────────────
    describe('Normal queries (fast parsing)', () => {
        it('should parse a simple query with no timeout warnings', () => {
            const result = parseSql('SELECT * FROM users WHERE id = 1', 'PostgreSQL' as SqlDialect);

            expect(result.nodes.length).toBeGreaterThan(0);
            const timeoutHint = result.hints.find(h =>
                h.message?.includes('timeout') || h.message?.includes('parsing took')
            );
            expect(timeoutHint).toBeUndefined();
        });

        it('should parse multi-join query with no warnings', () => {
            const sql = `
                SELECT * FROM users u
                JOIN orders o ON u.id = o.user_id
                JOIN products p ON o.product_id = p.id
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.nodes.length).toBeGreaterThan(0);
            const timeoutHint = result.hints.find(h => h.message?.includes('timeout'));
            expect(timeoutHint).toBeUndefined();
        });

        it('should parse CTEs with no warnings', () => {
            const sql = `
                WITH cte AS (SELECT id FROM table1)
                SELECT * FROM cte
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);
            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.hints.find(h => h.message?.includes('timeout'))).toBeUndefined();
        });
    });

    // ── Near-timeout warnings (70%+ of limit) ───────────────────────
    describe('Near-timeout warning (>70% of limit)', () => {
        it('should add medium-severity warning when parse approaches timeout', () => {
            // Simulate parse taking 4s (80% of 5s default)
            mockSlowParse(4000);

            const result = parseSql('SELECT * FROM users', 'PostgreSQL' as SqlDialect);

            const hint = result.hints.find(h =>
                h.message?.includes('approaching') && h.message?.includes('timeout')
            );
            expect(hint).toBeDefined();
            expect(hint!.severity).toBe('medium');
            expect(hint!.category).toBe('performance');
            expect(hint!.type).toBe('warning');
            expect(hint!.suggestion).toMatch(/simplif/i);
        });

        it('should include parse duration in warning message', () => {
            mockSlowParse(3600); // 72% of 5s

            const result = parseSql('SELECT * FROM users', 'MySQL' as SqlDialect);

            const hint = result.hints.find(h => h.message?.includes('approaching'));
            expect(hint).toBeDefined();
            expect(hint!.message).toMatch(/\d+\.\d+s/); // e.g. "3.6s"
        });

        it('should NOT warn when parse is under 70% of limit', () => {
            mockSlowParse(2000); // 40% of 5s

            const result = parseSql('SELECT * FROM users', 'PostgreSQL' as SqlDialect);

            expect(result.hints.find(h => h.message?.includes('timeout'))).toBeUndefined();
        });
    });

    // ── Timeout exceeded — regex fallback ────────────────────────────
    describe('Timeout exceeded (regex fallback)', () => {
        it('should fall back to regex parser when timeout exceeded', () => {
            mockSlowParse(6000); // Exceeds 5s default

            const result = parseSql(
                'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id',
                'PostgreSQL' as SqlDialect
            );

            // Regex fallback sets partial: true
            expect(result.partial).toBe(true);
        });

        it('should add high-severity hint when timeout exceeded', () => {
            mockSlowParse(8000);

            const result = parseSql('SELECT * FROM users', 'MySQL' as SqlDialect);

            const hint = result.hints.find(h =>
                h.message?.includes('exceeded') && h.message?.includes('timeout')
            );
            expect(hint).toBeDefined();
            expect(hint!.severity).toBe('high');
            expect(hint!.category).toBe('performance');
        });

        it('should still extract tables via regex fallback', () => {
            mockSlowParse(6000);

            const result = parseSql(
                'SELECT * FROM customers c JOIN orders o ON c.id = o.cust_id',
                'PostgreSQL' as SqlDialect
            );

            expect(result.partial).toBe(true);
            const tableNames = result.nodes.map(n => n.label.toLowerCase());
            expect(tableNames).toContain('customers');
            expect(tableNames).toContain('orders');
        });
    });

    // ── Configurable timeout ─────────────────────────────────────────
    describe('Configurable timeout via setParseTimeout()', () => {
        it('should respect custom timeout value', () => {
            setParseTimeout(100); // Very low — 100ms
            mockSlowParse(200);   // Simulate 200ms parse

            const result = parseSql('SELECT * FROM users', 'PostgreSQL' as SqlDialect);

            // Should trigger fallback since 200 > 100
            expect(result.partial).toBe(true);
        });

        it('should restore default timeout when called with no argument', () => {
            setParseTimeout(1);
            setParseTimeout(); // Restore default
            expect(PARSE_TIMEOUT_MS).toBe(5000);
        });

        it('should not trigger for fast parse with high timeout', () => {
            setParseTimeout(60000); // 60s
            mockSlowParse(3000);    // 3s — well under 60s

            const result = parseSql('SELECT * FROM users', 'MySQL' as SqlDialect);

            expect(result.partial).toBeUndefined();
            expect(result.hints.find(h => h.message?.includes('timeout'))).toBeUndefined();
        });
    });

    // ── Edge cases ───────────────────────────────────────────────────
    describe('Edge cases', () => {
        it('should handle empty SQL without timeout logic interfering', () => {
            const result = parseSql('', 'PostgreSQL' as SqlDialect);
            expect(result.nodes.length).toBe(0);
            expect(result.error).toBeDefined();
        });

        it('should handle very long column lists without crashing', () => {
            const columns = Array.from({ length: 100 }, (_, i) => `col${i}`).join(', ');
            const sql = `SELECT ${columns} FROM large_table`;
            const result = parseSql(sql, 'MySQL' as SqlDialect);
            expect(result.nodes).toBeDefined();
        });

        it('should work across all dialects', () => {
            const dialects: SqlDialect[] = ['PostgreSQL', 'MySQL', 'BigQuery', 'TransactSQL'] as SqlDialect[];
            for (const d of dialects) {
                const result = parseSql('SELECT 1 FROM dual', d);
                expect(result.nodes).toBeDefined();
            }
        });
    });
});
