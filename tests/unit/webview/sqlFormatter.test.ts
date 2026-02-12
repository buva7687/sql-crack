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
});
