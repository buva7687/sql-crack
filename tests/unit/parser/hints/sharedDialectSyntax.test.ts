import { createFreshContext } from '../../../../src/webview/parser/context';
import { detectDialect } from '../../../../src/webview/parser/dialects/detection';
import { detectDialectSpecificSyntax } from '../../../../src/webview/parser/dialects/warnings';
import type { SqlDialect } from '../../../../src/webview/types';

describe('shared dialect syntax does not suggest a wrong switch', () => {
    const messages = (sql: string, dialect: SqlDialect): string[] => {
        const context = createFreshContext(dialect);
        detectDialectSpecificSyntax(context, sql, dialect);
        return context.hints.map(hint => hint.message);
    };

    it('accepts NVL in Snowflake and Redshift', () => {
        for (const dialect of ['Snowflake', 'Redshift'] as const) {
            expect(messages('SELECT NVL(a, b) FROM t', dialect))
                .not.toContain('Oracle-specific syntax detected');
        }
        expect(detectDialect('SELECT NVL(a, b) FROM t').dialect).not.toBe('Oracle');
    });

    it('accepts MySQL JSON ->> and PostgreSQL named arguments', () => {
        expect(messages("SELECT doc->>'$.name' FROM t", 'MySQL'))
            .not.toContain('PostgreSQL-specific syntax detected');
        expect(messages('SELECT f(a => 1)', 'PostgreSQL'))
            .not.toContain('Snowflake-specific syntax detected');
        expect(detectDialect("SELECT doc->>'$.name' FROM t").dialect).not.toBe('PostgreSQL');
        expect(detectDialect('SELECT f(a => 1)').dialect).not.toBe('Snowflake');
    });

    it('warns for Oracle-style functions under MySQL while accepting compatible dialects', () => {
        expect(messages('SELECT NVL(a, b), DECODE(status, 1, 2) FROM t', 'MySQL'))
            .toContain('Oracle-compatible functions detected');
        for (const dialect of ['Oracle', 'Snowflake', 'Redshift'] as const) {
            expect(messages('SELECT NVL(a, b), DECODE(status, 1, 2) FROM t', dialect))
                .not.toContain('Oracle-compatible functions detected');
        }
        expect(messages("SELECT 'NVL(a, b)' FROM t -- DECODE(x, y)", 'MySQL'))
            .not.toContain('Oracle-compatible functions detected');
    });

    it('warns for unsupported JSON arrow and named-argument syntax without flagging shared dialects', () => {
        expect(messages("SELECT doc->>'$.name' FROM t", 'TransactSQL'))
            .toContain('JSON arrow syntax detected');
        for (const dialect of ['MySQL', 'PostgreSQL', 'Snowflake'] as const) {
            expect(messages("SELECT doc->>'$.name' FROM t", dialect))
                .not.toContain('JSON arrow syntax detected');
        }
        expect(messages('SELECT f(a => 1)', 'MySQL'))
            .toContain('Named-argument syntax detected');
        for (const dialect of ['PostgreSQL', 'BigQuery', 'Snowflake'] as const) {
            expect(messages('SELECT f(a => 1)', dialect))
                .not.toContain('Named-argument syntax detected');
        }
    });
});
