import { getDollarQuoteDelimiterAt, maskSqlCommentsPreservingPositions, stripSqlComments } from '../../../src/shared/stringUtils';

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

    it('preserves comment markers inside PostgreSQL dollar-quoted strings', () => {
        const sql = "SELECT $$-- literal /* text */$$, $body$# still literal$body$ FROM t -- comment";

        expect(stripSqlComments(sql)).toBe(
            "SELECT $$-- literal /* text */$$, $body$# still literal$body$ FROM t  "
        );
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

    it('preserves PostgreSQL dollar-quoted strings before masking real comments', () => {
        const sql = 'SELECT $tag$-- literal /* text */$tag$ FROM source_table; -- comment';
        const masked = maskSqlCommentsPreservingPositions(sql);

        expect(masked).toHaveLength(sql.length);
        expect(masked).toContain('$tag$-- literal /* text */$tag$ FROM source_table;');
        expect(masked).not.toContain('comment');
    });

    it('does not open a dollar quote on a dollar inside an identifier', () => {
        const sql = 'SELECT * FROM my$$tbl;\n-- SELECT * FROM ghost_tbl;\nSELECT * FROM real_tbl;';
        const masked = maskSqlCommentsPreservingPositions(sql);

        expect(masked).toHaveLength(sql.length);
        expect(masked).toContain('my$$tbl');
        expect(masked).not.toContain('ghost_tbl');
        expect(masked).toContain('real_tbl');
        expect(stripSqlComments(sql)).not.toContain('ghost_tbl');
    });

    it('does not open a dollar quote on a MySQL DELIMITER directive', () => {
        const sql = [
            'DELIMITER $$',
            'CREATE PROCEDURE p()',
            'BEGIN',
            '  -- SELECT * FROM commented_out_tbl;',
            '  INSERT INTO body_tbl SELECT * FROM src_tbl;',
            'END$$',
            'DELIMITER ;',
        ].join('\n');
        const masked = maskSqlCommentsPreservingPositions(sql);

        expect(masked).toHaveLength(sql.length);
        expect(masked).not.toContain('commented_out_tbl');
        expect(masked).toContain('body_tbl');
        expect(masked).toContain('src_tbl');
    });
});

describe('getDollarQuoteDelimiterAt', () => {
    it('recognizes genuine opening delimiters', () => {
        expect(getDollarQuoteDelimiterAt('AS $$body$$', 3)).toBe('$$');
        expect(getDollarQuoteDelimiterAt('AS $tag$b$tag$', 3)).toBe('$tag$');
        expect(getDollarQuoteDelimiterAt('AS $étiquette$b$étiquette$', 3)).toBe('$étiquette$');
        expect(getDollarQuoteDelimiterAt('$$top', 0)).toBe('$$');
    });

    it('rejects dollars that continue an identifier', () => {
        expect(getDollarQuoteDelimiterAt('my$$tbl', 2)).toBeNull();
        expect(getDollarQuoteDelimiterAt('café$$tbl', 4)).toBeNull();
        expect(getDollarQuoteDelimiterAt('таблица$$tbl', 7)).toBeNull();
        expect(getDollarQuoteDelimiterAt('END$$', 3)).toBeNull();
    });

    it('rejects MySQL DELIMITER directives and bind parameters', () => {
        expect(getDollarQuoteDelimiterAt('DELIMITER $$', 10)).toBeNull();
        expect(getDollarQuoteDelimiterAt('delimiter  $$', 11)).toBeNull();
        const alignedDirective = `  DELIMITER${' '.repeat(40)}$$`;
        expect(getDollarQuoteDelimiterAt(alignedDirective, alignedDirective.indexOf('$'))).toBeNull();
        expect(getDollarQuoteDelimiterAt('WHERE id = $1', 11)).toBeNull();
    });
});
