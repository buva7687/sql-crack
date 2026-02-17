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

    it('ignores Snowflake-like tokens inside string literals', () => {
        const result = detectDialect(`
            SELECT
                'payload:items' AS path_like,
                'input => value' AS named_arg_like,
                'FLATTEN(input => payload:items)' AS fn_like
            FROM events
        `);
        expect(result.scores.Snowflake || 0).toBe(0);
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

    it('does not treat time literals as Snowflake path operators', () => {
        const result = detectDialect(`
            SELECT
              date_bin('15 minutes'::interval, created_at, timestamptz '1970-01-01 00:00:00+00') AS bucket
            FROM events
            WHERE created_at > now() - interval '24 hours'
        `);
        expect(result.scores.Snowflake || 0).toBe(0);
        expect(result.dialect).toBe('PostgreSQL');
        expect(result.confidence).toBe('high');
    });

    it('detects PostgreSQL via AT TIME ZONE plus :: type cast', () => {
        const result = detectDialect(`
            SELECT
                created_at AT TIME ZONE 'UTC' AS utc_time,
                captured_at::date AS captured_date
            FROM events
        `);
        expect(result.dialect).toBe('PostgreSQL');
        expect(result.confidence).toBe('high');
        expect(result.scores.PostgreSQL).toBeGreaterThanOrEqual(2);
    });

    it('detects Oracle CONNECT BY with high confidence', () => {
        const result = detectDialect(`
            SELECT employee_id, manager_id, LEVEL
            FROM employees
            START WITH manager_id IS NULL
            CONNECT BY PRIOR employee_id = manager_id
        `);
        expect(result.dialect).toBe('Oracle');
        expect(result.confidence).toBe('high');
        expect(result.scores.Oracle).toBeGreaterThanOrEqual(3);
    });

    it('detects Oracle (+) outer join syntax with high confidence', () => {
        const result = detectDialect(`
            SELECT e.name, d.department_name
            FROM employees e, departments d
            WHERE e.department_id = d.department_id(+)
        `);
        expect(result.dialect).toBe('Oracle');
        expect(result.confidence).toBe('high');
        expect(result.scores.Oracle).toBeGreaterThanOrEqual(3);
    });

    it('detects Oracle ROWNUM + sequence as Oracle signal', () => {
        const result = detectDialect(`
            SELECT my_seq.NEXTVAL, ROWNUM
            FROM dual
        `);
        expect(result.scores.Oracle).toBeGreaterThanOrEqual(4);
        expect(result.dialect).toBe('Oracle');
        expect(result.confidence).toBe('high');
    });

    it('detects Oracle NVL/DECODE as low-confidence signal', () => {
        const result = detectDialect('SELECT NVL(name, DECODE(status, 1, active, inactive)) FROM users');
        expect(result.scores.Oracle).toBeGreaterThan(0);
    });

    it('ignores Oracle-like syntax inside comments', () => {
        const result = detectDialect('-- CONNECT BY PRIOR\nSELECT 1');
        expect(result.scores.Oracle || 0).toBe(0);
    });
});
