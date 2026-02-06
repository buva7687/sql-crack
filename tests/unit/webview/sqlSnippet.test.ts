import { extractSqlSnippet } from '../../../src/webview/sqlSnippet';

describe('sqlSnippet', () => {
    it('extracts a bounded multi-line snippet and line label', () => {
        const sql = [
            'SELECT u.id, o.total',
            'FROM users u',
            'JOIN orders o ON u.id = o.user_id',
            'WHERE o.total > 100',
            'ORDER BY o.total DESC',
        ].join('\n');

        const snippet = extractSqlSnippet(sql, 2, 4, 3, 120);
        expect(snippet).toEqual({
            snippet: 'FROM users u\nJOIN orders o ON u.id = o.user_id\nWHERE o.total > 100',
            lineLabel: 'Line 2-4',
            truncated: false,
        });
    });

    it('marks snippet as truncated when maxChars is exceeded', () => {
        const sql = 'SELECT id, user_name, email_address, created_at, updated_at FROM users';
        const snippet = extractSqlSnippet(sql, 1, 1, 3, 24);
        expect(snippet).toEqual({
            snippet: 'SELECT id, user_name, em...',
            lineLabel: 'Line 1',
            truncated: true,
        });
    });

    it('returns null when there is no valid start line', () => {
        expect(extractSqlSnippet('SELECT 1', undefined, undefined)).toBeNull();
    });
});
