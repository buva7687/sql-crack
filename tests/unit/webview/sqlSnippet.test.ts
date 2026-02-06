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
        });
    });

    it('returns null when there is no valid start line', () => {
        expect(extractSqlSnippet('SELECT 1', undefined, undefined)).toBeNull();
    });
});
