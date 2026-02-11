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

    it('detects three-part names as a Snowflake-leaning signal', () => {
        const result = detectDialect('SELECT * FROM analytics.sales.orders');
        expect(result.dialect).toBe('Snowflake');
        expect(result.confidence).toBe('high');
        expect(result.scores.Snowflake).toBeGreaterThan((result.scores.TransactSQL || 0));
        expect(result.scores.Redshift).toBeGreaterThan(0);
    });

    it('treats QUALIFY as Snowflake/BigQuery signal with low confidence when isolated', () => {
        const result = detectDialect('SELECT * FROM orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) = 1');
        expect(result.dialect).toBeNull();
        expect(result.confidence).toBe('low');
        expect(result.scores.Snowflake).toBeGreaterThan(0);
        expect(result.scores.BigQuery).toBeGreaterThan(0);
    });

    it('treats ILIKE as a shared PostgreSQL/Snowflake/Redshift signal', () => {
        const result = detectDialect("SELECT * FROM users WHERE email ILIKE '%@example.com'");
        expect(result.dialect).toBeNull();
        expect(result.confidence).toBe('low');
        expect(result.scores.PostgreSQL).toBeGreaterThan(0);
        expect(result.scores.Snowflake).toBeGreaterThan(0);
        expect(result.scores.Redshift).toBeGreaterThan(0);
    });

    it('detects combined Snowflake signals with high confidence', () => {
        const result = detectDialect(`
            CREATE OR REPLACE TABLE analytics.public.top_orders AS
            SELECT *
            FROM analytics.public.orders
            QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) = 1
        `);
        expect(result.dialect).toBe('Snowflake');
        expect(result.confidence).toBe('high');
        expect(result.scores.Snowflake).toBeGreaterThanOrEqual(5);
    });
});
