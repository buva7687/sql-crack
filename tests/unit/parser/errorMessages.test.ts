/**
 * Item #2: Better Error Messages for Parse Failures
 * 
 * Tests for verifying that error messages are helpful and suggest correct dialects
 * when parsing fails due to dialect-specific syntax.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #2: Better Error Messages for Parse Failures', () => {
    describe('Snowflake Syntax Detection', () => {
        it('should detect Snowflake : path operator and suggest Snowflake dialect', () => {
            const sql = `
                SELECT payload:items:sku
                FROM orders
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Should have a hint about Snowflake syntax
            const snowflakeHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('snowflake')
            );
            expect(snowflakeHint).toBeDefined();
        });

        it('should detect Snowflake => named arguments', () => {
            const sql = `
                SELECT FLATTEN(input => payload)
                FROM orders
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should have a hint about Snowflake syntax
            const snowflakeHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('snowflake')
            );
            expect(snowflakeHint).toBeDefined();
        });

        it('should parse Snowflake syntax correctly with Snowflake dialect', () => {
            const sql = `
                SELECT payload:items:sku
                FROM orders
            `;
            const result = parseSql(sql, 'Snowflake' as SqlDialect);

            // Should either parse successfully or give a better error
            expect(result).toBeDefined();
            // Should not have Snowflake syntax warning when using Snowflake dialect
            const snowflakeHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('snowflake')
            );
            expect(snowflakeHint).toBeUndefined();
        });
    });

    describe('BigQuery Syntax Detection', () => {
        it('should detect BigQuery STRUCT syntax', () => {
            const sql = `
                SELECT STRUCT('value' AS field)
                FROM orders
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Should have a hint about BigQuery syntax
            const bigqueryHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('bigquery')
            );
            expect(bigqueryHint).toBeDefined();
        });

        it('should detect BigQuery UNNEST syntax when on non-UNNEST dialect', () => {
            const sql = `
                SELECT *
                FROM orders, UNNEST(items) AS item
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Should have a hint about BigQuery syntax when on MySQL (which doesn't support UNNEST)
            const bigqueryHint = result.hints?.find((h: any) =>
                h.message?.toLowerCase().includes('bigquery')
            );
            expect(bigqueryHint).toBeDefined();
        });

        it('should not warn about UNNEST when using PostgreSQL dialect', () => {
            const sql = `
                SELECT *
                FROM orders, UNNEST(items) AS item
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // PostgreSQL supports UNNEST natively, no BigQuery hint expected
            const bigqueryHint = result.hints?.find((h: any) =>
                h.message?.toLowerCase().includes('bigquery')
            );
            expect(bigqueryHint).toBeUndefined();
        });

        it('should not warn when using BigQuery dialect', () => {
            const sql = `
                SELECT STRUCT('value' AS field)
                FROM orders
            `;
            const result = parseSql(sql, 'BigQuery' as SqlDialect);

            // Should not have BigQuery syntax warning when using BigQuery dialect
            const bigqueryHint = result.hints?.find((h: any) => 
                h.message?.toLowerCase().includes('bigquery')
            );
            expect(bigqueryHint).toBeUndefined();
        });
    });

    describe('PostgreSQL Syntax Detection', () => {
        it('should recover via retry for PostgreSQL INTERVAL syntax on MySQL', () => {
            const sql = `
                SELECT * FROM events
                WHERE created_at > NOW() - INTERVAL '1 day'
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).not.toBe(true);
            const retryHint = result.hints.find((h: any) =>
                h.message?.includes('Auto-retried parse with PostgreSQL')
            );
            expect(retryHint).toBeDefined();
        });

        it('should parse PostgreSQL syntax with PostgreSQL dialect', () => {
            const sql = `
                SELECT * FROM events
                WHERE created_at > NOW() - INTERVAL '1 day'
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should parse successfully
            expect(result.error).toBeUndefined();
        });
    });

    describe('MySQL Syntax Detection', () => {
        it('should detect MySQL backtick identifiers on non-MySQL dialect', () => {
            const sql = `
                SELECT \`column\`, \`another column\`
                FROM \`table-name\`
            `;
            const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

            // Should have a hint about MySQL syntax
            const mysqlHint = result.hints?.find((h: any) =>
                h.message?.toLowerCase().includes('mysql')
            );
            expect(mysqlHint).toBeDefined();
        });
    });

    describe('Generic Error Messages', () => {
        it('should provide helpful hints when syntax is completely unknown', () => {
            const sql = `
                SELECT INVALID SYNTAX HERE
                FROM orders
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Fallback parser produces partial result with error hints
            expect(result.partial).toBe(true);
            const errorHint = result.hints.find((h: any) => h.type === 'error');
            expect(errorHint).toBeDefined();
            expect(errorHint!.message.length).toBeGreaterThan(0);
        });

        it('should include parse error details in hints', () => {
            const sql = `SELECT FROM WHERE`;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            // Fallback parser produces partial result
            expect(result.partial).toBe(true);
            const errorHint = result.hints.find((h: any) => h.type === 'error');
            expect(errorHint).toBeDefined();
            // Error hint should contain parse error message
            expect(errorHint!.message).toMatch(/parse error/i);
        });
    });
});
