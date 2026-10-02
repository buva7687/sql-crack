import { parseSql } from '../../../../src/webview/sqlParser';

describe('parse error classification', () => {
    it('does not treat identifier fragments as set operations or recursive CTEs', () => {
        for (const column of ['exception_id', 'is_recursive']) {
            const result = parseSql(`SELECT ${column} FROM t WHERE ???`, 'TransactSQL');
            const error = result.hints.find(hint => hint.message.startsWith('Parse error:'))?.message || '';
            expect(error).not.toMatch(/INTERSECT\/EXCEPT|RECURSIVE CTE/);
        }
    });
});
