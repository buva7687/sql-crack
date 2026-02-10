import { detectDialect } from '../../../src/webview/sqlParser';

describe('detectDialect', () => {
    it('detects Snowflake FLATTEN syntax with high confidence', () => {
        const result = detectDialect('SELECT f.value FROM src, LATERAL FLATTEN(input => payload:items) f');
        expect(result.dialect).toBe('Snowflake');
        expect(result.confidence).toBe('high');
        expect(result.scores.Snowflake).toBeGreaterThanOrEqual(2);
    });

    it('detects PostgreSQL dollar-quoted syntax with high confidence', () => {
        const result = detectDialect("SELECT $$hello$$ AS msg");
        expect(result.dialect).toBe('PostgreSQL');
        expect(result.confidence).toBe('high');
    });

    it('detects MySQL backtick syntax with high confidence', () => {
        const result = detectDialect('SELECT `id` FROM `users`');
        expect(result.dialect).toBe('MySQL');
        expect(result.confidence).toBe('high');
    });

    it('detects SQL Server CROSS APPLY syntax with high confidence', () => {
        const result = detectDialect('SELECT * FROM orders CROSS APPLY OPENJSON(tags) j');
        expect(result.dialect).toBe('TransactSQL');
        expect(result.confidence).toBe('high');
    });

    it('returns none for plain SQL with no dialect signal', () => {
        const result = detectDialect('SELECT 1');
        expect(result.dialect).toBeNull();
        expect(result.confidence).toBe('none');
    });

    it('ignores line comments during detection', () => {
        const result = detectDialect('-- FLATTEN(input => payload:items)\nSELECT 1');
        expect(result.dialect).toBeNull();
        expect(result.confidence).toBe('none');
    });

    it('detects BigQuery STRUCT + UNNEST with high confidence', () => {
        const result = detectDialect('SELECT item.x FROM UNNEST([STRUCT(1 AS x), STRUCT(2 AS x)]) AS item');
        expect(result.dialect).toBe('BigQuery');
        expect(result.confidence).toBe('high');
        expect(result.scores.BigQuery).toBeGreaterThanOrEqual(2);
    });
});
