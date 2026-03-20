import { stripSqlComments } from '../../../src/shared/stringUtils';

describe('stripSqlComments', () => {
    it('strips line comments (--)', () => {
        expect(stripSqlComments('SELECT 1 -- comment')).toBe('SELECT 1  ');
    });

    it('strips block comments (/* */)', () => {
        expect(stripSqlComments('SELECT /* comment */ 1')).toBe('SELECT   1');
    });

    it('strips nested block comments', () => {
        expect(stripSqlComments('SELECT /* outer /* inner */ still comment */ 1')).toBe('SELECT   1');
    });

    it('strips hash comments (#)', () => {
        expect(stripSqlComments('SELECT 1 # comment')).toBe('SELECT 1  ');
    });

    it('preserves -- inside single-quoted strings', () => {
        const sql = "SELECT '--not a comment' FROM t";
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('preserves /* */ inside single-quoted strings', () => {
        const sql = "SELECT '/* not a comment */' FROM t";
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('preserves -- inside double-quoted identifiers', () => {
        const sql = 'SELECT "col--name" FROM t';
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('preserves /* */ inside double-quoted identifiers', () => {
        const sql = 'SELECT "col/* */name" FROM t';
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('preserves -- inside backtick-quoted identifiers', () => {
        const sql = 'SELECT `col--name` FROM t';
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('preserves # inside backtick-quoted identifiers', () => {
        const sql = 'SELECT `col#name` FROM t';
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('handles escaped single quotes (double-single)', () => {
        const sql = "SELECT 'it''s -- fine' FROM t";
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('handles mixed quotes and comments', () => {
        const sql = `SELECT '--ok', "id--x" -- real comment\nFROM t`;
        const result = stripSqlComments(sql);
        expect(result).toContain("'--ok'");
        expect(result).toContain('"id--x"');
        expect(result).not.toContain('real comment');
        expect(result).toContain('FROM t');
    });

    it('handles unterminated single-quoted string gracefully', () => {
        const sql = "SELECT 'unterminated";
        // Should not throw
        expect(() => stripSqlComments(sql)).not.toThrow();
    });

    it('handles unterminated block comment gracefully', () => {
        const sql = 'SELECT /* unterminated';
        expect(() => stripSqlComments(sql)).not.toThrow();
        // Comment should be stripped
        expect(stripSqlComments(sql)).toBe('SELECT  ');
    });

    it('handles empty string', () => {
        expect(stripSqlComments('')).toBe('');
    });

    it('handles SQL with no comments', () => {
        const sql = 'SELECT a, b FROM t WHERE x = 1';
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('strips multi-line block comment', () => {
        const sql = 'SELECT\n/* multi\nline\ncomment */\n1';
        expect(stripSqlComments(sql)).toBe('SELECT\n \n1');
    });
});
