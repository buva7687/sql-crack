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

    // Hive detection
    it('detects Hive LATERAL VIEW with high confidence', () => {
        const result = detectDialect('SELECT * FROM src LATERAL VIEW EXPLODE(items) t AS item');
        expect(result.dialect).toBe('Hive');
        expect(result.confidence).toBe('high');
        expect(result.scores.Hive).toBeGreaterThanOrEqual(3);
    });

    it('detects Hive DISTRIBUTE BY + SORT BY with high confidence', () => {
        const result = detectDialect('SELECT * FROM events DISTRIBUTE BY category SORT BY timestamp');
        expect(result.dialect).toBe('Hive');
        expect(result.confidence).toBe('high');
        expect(result.scores.Hive).toBeGreaterThanOrEqual(3);
    });

    it('detects Hive CLUSTER BY with high confidence', () => {
        const result = detectDialect('SELECT * FROM orders CLUSTER BY customer_id');
        expect(result.dialect).toBe('Hive');
        expect(result.confidence).toBe('high');
    });

    it('detects Hive SERDE/ROW FORMAT with high confidence', () => {
        const result = detectDialect("CREATE TABLE logs (msg STRING) ROW FORMAT DELIMITED FIELDS TERMINATED BY ','");
        expect(result.dialect).toBe('Hive');
        expect(result.confidence).toBe('high');
    });

    // Trino detection
    it('detects Trino ROWS FROM with high confidence', () => {
        const result = detectDialect('SELECT * FROM UNNEST(ROWS FROM(sequence(1, 5)))');
        expect(result.dialect).toBe('Trino');
        expect(result.confidence).toBe('high');
        expect(result.scores.Trino).toBeGreaterThanOrEqual(3);
    });

    it('detects Trino MAP_FROM_ENTRIES with high confidence', () => {
        const result = detectDialect('SELECT MAP_FROM_ENTRIES(ARRAY[(1, 2), (3, 4)])');
        expect(result.dialect).toBe('Trino');
        expect(result.confidence).toBe('high');
    });

    // Athena detection
    it('detects Athena CREATE EXTERNAL TABLE with high confidence', () => {
        const result = detectDialect('CREATE EXTERNAL TABLE sales (id INT) LOCATION \'s3://bucket/path\' TBLPROPERTIES (\'format\'=\'parquet\')');
        expect(result.dialect).toBe('Athena');
        expect(result.confidence).toBe('high');
    });

    it('detects Athena TBLPROPERTIES with high confidence', () => {
        const result = detectDialect("CREATE TABLE t (id INT) TBLPROPERTIES ('skip.header.line.count'='1')");
        expect(result.dialect).toBe('Athena');
        expect(result.confidence).toBe('high');
    });

    // Redshift detection
    it('detects Redshift DISTKEY with high confidence', () => {
        const result = detectDialect('CREATE TABLE sales (id INT, amount DECIMAL(10,2)) DISTKEY(id)');
        expect(result.dialect).toBe('Redshift');
        expect(result.confidence).toBe('high');
        expect(result.scores.Redshift).toBeGreaterThanOrEqual(3);
    });

    it('detects Redshift SORTKEY with high confidence', () => {
        const result = detectDialect('CREATE TABLE t (id INT) SORTKEY(id)');
        expect(result.dialect).toBe('Redshift');
        expect(result.confidence).toBe('high');
    });

    it('detects Redshift DISTSTYLE with high confidence', () => {
        const result = detectDialect('CREATE TABLE t (id INT) DISTSTYLE ALL');
        expect(result.dialect).toBe('Redshift');
        expect(result.confidence).toBe('high');
    });

    it('detects Redshift COPY with high confidence', () => {
        const result = detectDialect("COPY users FROM 's3://bucket/file' IAM_ROLE 'arn:aws:iam::role'");
        expect(result.dialect).toBe('Redshift');
        expect(result.confidence).toBe('high');
    });

    it('detects Redshift UNLOAD with high confidence', () => {
        const result = detectDialect("UNLOAD ('SELECT * FROM events') TO 's3://bucket/output'");
        expect(result.dialect).toBe('Redshift');
        expect(result.confidence).toBe('high');
    });

    // SQLite detection
    it('detects SQLite AUTOINCREMENT with high confidence', () => {
        const result = detectDialect('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
        expect(result.dialect).toBe('SQLite');
        expect(result.confidence).toBe('high');
        expect(result.scores.SQLite).toBeGreaterThanOrEqual(3);
    });

    it('detects SQLite PRAGMA with high confidence', () => {
        const result = detectDialect('PRAGMA table_info(users)');
        expect(result.dialect).toBe('SQLite');
        expect(result.confidence).toBe('high');
    });

    it('detects SQLite GLOB operator with high confidence', () => {
        const result = detectDialect("SELECT * FROM files WHERE name GLOB '*.txt'");
        expect(result.dialect).toBe('SQLite');
        expect(result.confidence).toBe('high');
    });

    // Overlap tests
    it('Hive LATERAL VIEW without EXTERNAL TABLE scores high confidence for Hive', () => {
        const result = detectDialect('SELECT * FROM src LATERAL VIEW EXPLODE(arr) t AS item');
        expect(result.dialect).toBe('Hive');
        expect(result.confidence).toBe('high');
    });

    it('Hive DISTRIBUTE BY scores high confidence for Hive over Athena signals', () => {
        const result = detectDialect('SELECT * FROM t DISTRIBUTE BY x SORT BY y');
        expect(result.dialect).toBe('Hive');
        expect(result.confidence).toBe('high');
    });

    // Teradata detection
    it('detects Teradata CREATE VOLATILE TABLE with high confidence', () => {
        const result = detectDialect('CREATE VOLATILE TABLE temp_orders AS (SELECT * FROM orders) WITH DATA PRIMARY INDEX (order_id)');
        expect(result.dialect).toBe('Teradata');
        expect(result.confidence).toBe('high');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(3);
    });

    it('detects Teradata CREATE MULTISET TABLE with high confidence', () => {
        const result = detectDialect('CREATE MULTISET TABLE customer_sales (customer_id INTEGER, sale_amount DECIMAL(10,2)) PRIMARY INDEX (customer_id)');
        expect(result.dialect).toBe('Teradata');
        expect(result.confidence).toBe('high');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(6);
    });

    it('detects Teradata PRIMARY INDEX with high confidence', () => {
        const result = detectDialect('CREATE TABLE orders (id INTEGER) PRIMARY INDEX (id)');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(3);
    });

    it('detects Teradata HASHROW function with high confidence', () => {
        const result = detectDialect('SELECT HASHROW(customer_id) AS hash_val FROM customers');
        expect(result.dialect).toBe('Teradata');
        expect(result.confidence).toBe('high');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(3);
    });

    it('detects Teradata COLLECT STATISTICS with high confidence', () => {
        const result = detectDialect('COLLECT STATISTICS ON orders COLUMN (order_id)');
        expect(result.dialect).toBe('Teradata');
        expect(result.confidence).toBe('high');
    });

    it('detects Teradata LOCKING syntax as medium-confidence', () => {
        const result = detectDialect('SELECT * FROM customers LOCKING ROW FOR ACCESS WHERE customer_id = 1');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(2);
    });

    it('detects Teradata SEL shorthand as medium-confidence', () => {
        const result = detectDialect('SEL customer_id, customer_name FROM customers');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(2);
    });

    it('detects Teradata SAMPLE clause as medium-confidence', () => {
        const result = detectDialect('SELECT * FROM customers SAMPLE 1000');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(2);
    });

    it('does not false-positive SEL inside identifiers', () => {
        const result = detectDialect('SELECT selected_count FROM metrics');
        expect(result.scores.Teradata || 0).toBe(0);
    });

    it('ignores Teradata-like syntax inside comments', () => {
        const result = detectDialect('-- CREATE VOLATILE TABLE temp AS\nSELECT 1');
        expect(result.scores.Teradata || 0).toBe(0);
    });

    it('QUALIFY alone does not high-confidence detect Teradata over Snowflake/BigQuery', () => {
        const result = detectDialect('SELECT * FROM orders QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY dt DESC) = 1');
        // All three get QUALIFY signal, none should be high confidence alone
        expect(result.confidence).toBe('low');
        expect(result.scores.Teradata).toBeGreaterThan(0);
        expect(result.scores.Snowflake).toBeGreaterThan(0);
        expect(result.scores.BigQuery).toBeGreaterThan(0);
    });

    it('detects indented SEL as Teradata', () => {
        const result = detectDialect('  SEL id, name FROM employees');
        expect(result.dialect).toBe('Teradata');
    });

    it('detects LOCKING TABLE <object> FOR ACCESS as Teradata', () => {
        const result = detectDialect('LOCKING TABLE customers FOR ACCESS SELECT * FROM customers');
        expect(result.scores.Teradata).toBeGreaterThanOrEqual(2);
    });
});
