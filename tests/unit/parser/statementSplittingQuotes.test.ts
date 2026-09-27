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

    it('does not split on semicolons after MySQL backslash-escaped quotes', () => {
        const result = splitSqlStatements("SELECT 'O\\';Brien;x'; SELECT 2;");

        expect(result).toHaveLength(2);
        expect(result[0]).toContain("'O\\';Brien;x'");
        expect(result[1]).toBe('SELECT 2');
    });

    it('preserves doubled double quotes in quoted identifiers', () => {
        const result = splitSqlStatements('SELECT "co""l;n" FROM t; SELECT 2;');
        expect(result).toHaveLength(2);
        expect(result[0]).toContain('"co""l;n"');
    });
});

describe('statement splitting — long statements', () => {
    it('splits a single large INSERT in linear time', () => {
        const rows = Array.from({ length: 12000 }, (_, i) => `(${i}, 'name_${i}', ${i * 3})`);
        const sql = `INSERT INTO t (a, b, c) VALUES\n${rows.join(',\n')};\nSELECT 1;`;
        expect(sql.length).toBeGreaterThan(300 * 1024);

        const started = Date.now();
        const statements = splitSqlStatements(sql, 'PostgreSQL');
        const elapsedMs = Date.now() - started;

        expect(statements).toHaveLength(2);
        expect(statements[1]).toBe('SELECT 1');
        // Trimming the growing statement on every character took ~6-14 s here.
        expect(elapsedMs).toBeLessThan(1500);
    });

    it('still recognizes DELIMITER only at the start of a statement', () => {
        const sql = [
            "SELECT 'DELIMITER //' AS note;",
            'DELIMITER //',
            'CREATE PROCEDURE p() BEGIN SELECT 1; END //',
            'DELIMITER ;',
            'SELECT 2;',
        ].join('\n');

        expect(splitSqlStatements(sql, 'MySQL')).toEqual([
            "SELECT 'DELIMITER //' AS note",
            'CREATE PROCEDURE p() BEGIN SELECT 1; END',
            'SELECT 2',
        ]);
    });

    it('recognizes DELIMITER after leading comments', () => {
        const sql = [
            '-- migration header',
            '/* generated script */',
            'DELIMITER $$',
            'CREATE PROCEDURE p() BEGIN SELECT 1; END $$',
            'DELIMITER ;',
            'SELECT 2;',
        ].join('\n');

        expect(splitSqlStatements(sql, 'MySQL')).toEqual([
            'CREATE PROCEDURE p() BEGIN SELECT 1; END',
            'SELECT 2',
        ]);
    });
});
