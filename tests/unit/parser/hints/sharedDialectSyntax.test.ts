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
});
