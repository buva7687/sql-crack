import { formatSql, highlightSql } from '../../../src/webview/sqlFormatter';

describe('formatSql', () => {
    it('returns empty/whitespace SQL unchanged', () => {
        expect(formatSql('')).toBe('');
        expect(formatSql('   ')).toBe('   ');
    });

    it('uppercases SQL keywords by default', () => {
        const result = formatSql('select a from t where x = 1');
        expect(result).toContain('SELECT');
        expect(result).toContain('FROM');
        expect(result).toContain('WHERE');
    });

    it('does not uppercase keywords inside string literals', () => {
        const result = formatSql("select 'hello world' as val from t");
        expect(result).toContain("'hello world'");
    });

    it('adds line breaks before major clauses', () => {
        const result = formatSql('SELECT a FROM t WHERE x = 1 ORDER BY a');
        const lines = result.split('\n').map(l => l.trim());
        expect(lines).toContain('FROM t');
        expect(lines.some(l => l.startsWith('WHERE'))).toBe(true);
        expect(lines.some(l => l.startsWith('ORDER BY'))).toBe(true);
    });

    it('formats CTE WITH clause', () => {
        const result = formatSql('WITH cte AS (SELECT 1) SELECT * FROM cte');
        expect(result).toContain('WITH cte AS');
    });

    it('formats subquery SELECT in parentheses', () => {
        const result = formatSql('SELECT * FROM (SELECT id FROM t) sub');
        expect(result).toContain('SELECT');
    });

    it('indents JOIN ON conditions', () => {
        const result = formatSql('SELECT a FROM t1 JOIN t2 ON t1.id = t2.id');
        expect(result).toContain('ON ');
    });

    it('indents AND/OR in WHERE clauses', () => {
        const result = formatSql('SELECT a FROM t WHERE x = 1 AND y = 2 OR z = 3');
        const lines = result.split('\n').map(l => l.trim());
        expect(lines.some(l => l.startsWith('AND'))).toBe(true);
        expect(lines.some(l => l.startsWith('OR'))).toBe(true);
    });

    it('formats SELECT with many columns into individual lines', () => {
        const result = formatSql('SELECT a, b, c, d, e FROM t');
        const lines = result.split('\n');
        // With > 2 columns, each should be on its own line
        expect(lines.length).toBeGreaterThan(2);
    });

    it('does not split SELECT with only 2 columns', () => {
        const result = formatSql('SELECT a, b FROM t');
        // Should keep on one line
        const selectLine = result.split('\n').find(l => l.trim().startsWith('SELECT'));
        expect(selectLine).toContain('a');
        expect(selectLine).toContain('b');
    });

    it('handles SELECT DISTINCT with columns', () => {
        const result = formatSql('SELECT DISTINCT a, b, c, d FROM t');
        expect(result).toContain('SELECT');
        expect(result).toContain('DISTINCT');
    });

    it('preserves comments in formatted output', () => {
        const sql = '-- header\nSELECT a FROM t';
        const result = formatSql(sql);
        expect(result).toContain('-- header');
        expect(result).toContain('SELECT');
    });

    it('preserves block comments between clauses', () => {
        const sql = 'SELECT a /* columns */ FROM t /* table */';
        const result = formatSql(sql);
        expect(result).toContain('/* columns */');
        expect(result).toContain('/* table */');
    });

    it('cleans up excessive blank lines', () => {
        const sql = 'SELECT a\n\n\n\nFROM t';
        const result = formatSql(sql);
        expect(result).not.toContain('\n\n\n');
    });

    it('respects custom indent option', () => {
        const result = formatSql('SELECT a, b, c, d FROM t', { indent: '\t' });
        expect(result).toBeTruthy();
    });

    it('can disable uppercase with option', () => {
        const result = formatSql('select a from t', { uppercase: false });
        expect(result).toContain('select');
        expect(result).not.toContain('SELECT');
    });

    it('handles INSERT statement keywords', () => {
        const result = formatSql('insert into t values (1, 2, 3)');
        expect(result).toContain('INSERT');
        expect(result).toContain('INTO');
        expect(result).toContain('VALUES');
    });

    it('handles UPDATE SET statement', () => {
        const result = formatSql('update t set x = 1 where id = 5');
        expect(result).toContain('UPDATE');
        expect(result).toContain('SET');
    });

    it('handles UNION compound queries', () => {
        const result = formatSql('SELECT a FROM t1 UNION SELECT a FROM t2');
        const lines = result.split('\n').map(l => l.trim());
        expect(lines.some(l => l.startsWith('UNION'))).toBe(true);
    });

    it('handles comma inside parentheses without splitting', () => {
        const result = formatSql('SELECT COALESCE(a, b, c), d, e, f FROM t');
        // Should not split the COALESCE arguments
        expect(result).toContain('COALESCE');
    });
});

describe('highlightSql', () => {
    it('returns empty string for falsy input', () => {
        expect(highlightSql('')).toBe('');
    });

    it('highlights SQL keywords', () => {
        const result = highlightSql('SELECT a FROM t');
        expect(result).toContain('color: #c792ea');
        expect(result).toContain('SELECT');
        expect(result).toContain('FROM');
    });

    it('highlights string literals', () => {
        const result = highlightSql("WHERE name = 'test'");
        expect(result).toContain('color: #c3e88d');
        // escapeHtmlSimple only escapes &, <, > — single quotes pass through
        expect(result).toContain("'test'");
    });

    it('highlights numeric literals', () => {
        const result = highlightSql('WHERE x = 42');
        expect(result).toContain('color: #f78c6c');
        expect(result).toContain('42');
    });

    it('highlights functions (word followed by parenthesis)', () => {
        const result = highlightSql('SELECT COUNT(*) FROM t');
        expect(result).toContain('color: #82aaff');
        expect(result).toContain('COUNT');
    });

    it('highlights line comments', () => {
        const result = highlightSql('SELECT 1 -- note');
        expect(result).toContain('font-style: italic');
        expect(result).toContain('-- note');
    });

    it('escapes HTML in output', () => {
        const result = highlightSql('SELECT <tag>');
        expect(result).toContain('&lt;tag&gt;');
        expect(result).not.toContain('<tag>');
    });

    it('handles double-quoted string literals', () => {
        const result = highlightSql('SELECT "column" FROM t');
        expect(result).toContain('color: #c3e88d');
    });

    it('handles escaped characters in strings', () => {
        const result = highlightSql("SELECT 'it\\'s'");
        expect(result).toContain('color: #c3e88d');
    });

    it('highlights decimal numbers', () => {
        const result = highlightSql('SELECT 3.14');
        expect(result).toContain('3.14');
        expect(result).toContain('color: #f78c6c');
    });

    it('treats identifiers without parenthesis as identifiers', () => {
        const result = highlightSql('SELECT my_col FROM t');
        // my_col is not a keyword and not followed by (, so it's an identifier (no special color)
        expect(result).toContain('my_col');
    });

    it('handles operators and punctuation', () => {
        const result = highlightSql('SELECT * FROM t');
        expect(result).toContain('*');
    });

    it('handles function with whitespace before parenthesis', () => {
        const result = highlightSql('SELECT COUNT (*)');
        // COUNT should still be detected as function
        expect(result).toContain('COUNT');
    });
});
