import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('unrecognized table function hints', () => {
    it('does not emit hint for recognized TVFs (UNNEST in BigQuery)', () => {
        const sql = 'SELECT * FROM UNNEST([1, 2, 3]) AS item';
        const result = parseSql(sql, 'BigQuery' as SqlDialect);

        const unrecognizedHint = result.hints.find(h => h.message.startsWith('Unrecognized table function:'));
        expect(unrecognizedHint).toBeUndefined();
    });

    it('emits hint for unknown function calls in FROM clause', () => {
        const sql = 'SELECT * FROM MYSTERY_FUNC(1) AS x';
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const hint = result.hints.find(h => h.message === 'Unrecognized table function: MYSTERY_FUNC');
        expect(hint).toBeDefined();
        expect(hint?.type).toBe('info');
        expect(hint?.category).toBe('quality');
        expect(hint?.severity).toBe('low');
        expect(hint?.suggestion).toContain('sqlCrack.customTableValuedFunctions');
    });

    it('deduplicates repeated hints for the same unknown table function', () => {
        const sql = 'SELECT * FROM MYSTERY_FUNC(1) AS a JOIN MYSTERY_FUNC(2) AS b ON true';
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const matches = result.hints.filter(h => h.message === 'Unrecognized table function: MYSTERY_FUNC');
        expect(matches).toHaveLength(1);
    });
});
