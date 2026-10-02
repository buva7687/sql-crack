import { formatSql } from '../../../src/webview/sqlFormatter';

describe('sqlFormatter comment edge cases', () => {
    it('preserves EOF line comment without trailing newline', () => {
        const sql = 'SELECT 1 -- end of file';
        const result = formatSql(sql);
        expect(result).toContain('-- end of file');
    });

    it('preserves EOF block comment without trailing newline', () => {
        const sql = 'SELECT 1 /* final note */';
        const result = formatSql(sql);
        expect(result).toContain('/* final note */');
    });

    it('preserves multiple consecutive line comments', () => {
        const sql = [
            '-- first comment',
            '-- second comment',
            '-- third comment',
            'SELECT 1',
        ].join('\n');
        const result = formatSql(sql);
        expect(result).toContain('-- first comment');
        expect(result).toContain('-- second comment');
        expect(result).toContain('-- third comment');
    });

    it('does not treat comment content inside a string literal as a comment', () => {
        const sql = "SELECT '-- not a comment' AS val";
        const result = formatSql(sql);
        // The string literal should survive intact (keywords may be uppercased around it)
        expect(result).toContain("'-- not a comment'");
    });

    it('preserves block comment between clauses', () => {
        const sql = 'SELECT a /* pick columns */ FROM t';
        const result = formatSql(sql);
        expect(result).toContain('/* pick columns */');
    });

    it('restores a multiline block comment containing line-comment syntax', () => {
        const comment = '/* explanation\n * -- example only\n * still block text\n */';
        const result = formatSql('SELECT a\n' + comment + '\nFROM t');

        expect(result).toContain(comment);
        expect(result).not.toMatch(/__COMMENT_\d+__/);
    });
});

describe('sqlFormatter quoted SQL', () => {
    it('preserves literals and quoted identifiers through every formatting pass', () => {
        const tokens = ["'a  b, AND SELECT'", '"from  here"', '`order by`', '[group  by]', '$tag$one  two, AND$tag$'];
        const sql = `select ${tokens.join(', ')} from t where name = 'a  b, AND SELECT'`;
        const formatted = formatSql(sql);
        for (const token of tokens) {
            expect(formatted).toContain(token);
        }
        expect(formatted.match(/'a {2}b, AND SELECT'/g)).toHaveLength(2);
    });
});

it('does not replace a SQL identifier that resembles a comment marker', () => {
    const sql = 'SELECT __COMMENT_0__ -- note\nFROM t';
    const formatted = formatSql(sql);
    expect(formatted).toContain('SELECT __COMMENT_0__ -- note\nFROM t');
    expect(formatted.match(/__COMMENT_0__/g)).toHaveLength(1);
});
