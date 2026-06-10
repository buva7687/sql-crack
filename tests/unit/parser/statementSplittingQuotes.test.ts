/**
 * Behavioral coverage for quote/identifier-delimiter handling in statement
 * splitting. Regression guard for #N6 (backtick delimiters) and the doubled-
 * delimiter preservation fix — the splitter must not corrupt identifiers or
 * literals when it splits multi-statement SQL.
 */

import { splitSqlStatements } from '../../../src/webview/parser/validation/splitting';

describe('statement splitting — quote and identifier delimiters', () => {
    it('does not split on a semicolon inside a backtick-quoted identifier', () => {
        const result = splitSqlStatements('SELECT * FROM `ab;c`; SELECT 2;');
        expect(result).toHaveLength(2);
        expect(result[0]).toContain('`ab;c`');
    });

    it('preserves doubled backticks (escaped identifier) in the statement text', () => {
        // `a``b;c` is a single identifier containing a backtick and a semicolon.
        const result = splitSqlStatements('SELECT * FROM `a``b;c`; SELECT 2;');
        expect(result).toHaveLength(2);
        // The doubled backtick must survive intact — not collapse to `ab;c`.
        expect(result[0]).toContain('`a``b;c`');
    });

    it('preserves doubled single quotes in string literals', () => {
        const result = splitSqlStatements("SELECT 'O''Brien;x'; SELECT 2;");
        expect(result).toHaveLength(2);
        expect(result[0]).toContain("'O''Brien;x'");
    });

    it('preserves doubled double quotes in quoted identifiers', () => {
        const result = splitSqlStatements('SELECT "co""l;n" FROM t; SELECT 2;');
        expect(result).toHaveLength(2);
        expect(result[0]).toContain('"co""l;n"');
    });
});
