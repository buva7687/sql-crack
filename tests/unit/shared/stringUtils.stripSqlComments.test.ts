import { maskSqlCommentsPreservingPositions, stripSqlComments } from '../../../src/shared/stringUtils';

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

    it('strips MySQL hash comments that begin immediately with a word', () => {
        expect(stripSqlComments('#CONNECT BY PRIOR id = parent_id\nSELECT 1')).toBe(' \nSELECT 1');
    });

    it('preserves contextual SQL Server temp-table identifiers', () => {
        const sql = 'CREATE TABLE #temp (id INT); SELECT #temp.id FROM #temp';
        expect(stripSqlComments(sql)).toBe(sql);
    });

    it('can force ambiguous hashes to be treated as comments for MySQL-aware callers', () => {
        const sql = 'SELECT * FROM\n#comment without whitespace\nusers';
        expect(stripSqlComments(sql, { preserveHashTempIdentifiers: false })).toBe('SELECT * FROM\n \nusers');
    });

    it('preserves SQL Server global temp-table identifiers', () => {
        const sql = 'CREATE TABLE ##global_temp (id INT); SELECT * FROM ##global_temp';
        expect(stripSqlComments(sql)).toBe(sql);
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

describe('maskSqlCommentsPreservingPositions', () => {
    it('preserves length and newlines while masking nested comments', () => {
        const sql = '/* outer\n/* inner */\nstill outer */\nSELECT * FROM "real_table";';
        const masked = maskSqlCommentsPreservingPositions(sql);

        expect(masked).toHaveLength(sql.length);
        expect(masked.match(/\n/g)).toHaveLength(sql.match(/\n/g)?.length || 0);
        expect(masked).not.toContain('outer');
        expect(masked).toContain('SELECT * FROM "real_table";');
    });

    it('preserves quoted identifiers and contextual temp tables', () => {
        const sql = 'SELECT * FROM "quoted_table" JOIN #temp ON 1 = 1; -- comment';
        const masked = maskSqlCommentsPreservingPositions(sql);

        expect(masked).toContain('"quoted_table"');
        expect(masked).toContain('#temp');
        expect(masked).not.toContain('comment');
        expect(masked).toHaveLength(sql.length);
    });
});
