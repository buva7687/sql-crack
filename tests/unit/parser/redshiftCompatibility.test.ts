import { parseSql, preprocessForParsing } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Redshift compatibility support', () => {
    it('rewrites SELECT INTO to CTAS for parser compatibility', () => {
        const sql = `
            SELECT DISTINCT user_id
            INTO analytics.daily_users
            FROM raw_events
        `;

        const { sql: rewritten } = preprocessForParsing(sql, 'Redshift' as SqlDialect);

        expect(rewritten).toContain('CREATE TABLE analytics.daily_users AS SELECT DISTINCT user_id');
        expect(rewritten).toContain('FROM raw_events');
    });

    it('parses Redshift SELECT INTO schema-qualified targets without partial fallback', () => {
        const sql = `
            SELECT DISTINCT user_id
            INTO analytics.daily_users
            FROM raw_events
        `;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const root = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'TABLE analytics.daily_users'
            && node.operationType === 'CREATE_TABLE_AS'
        );
        const source = result.nodes.find((node: any) => node.type === 'table' && node.label === 'raw_events');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(root).toBeDefined();
        expect(source).toBeDefined();
    });

    it('rewrites CTE-based Redshift SELECT INTO to valid CTAS syntax', () => {
        const sql = `
            WITH recent_events AS (
                SELECT user_id
                FROM raw_events
            )
            SELECT DISTINCT user_id
            INTO analytics.daily_users
            FROM recent_events
        `;

        const { sql: rewritten } = preprocessForParsing(sql, 'Redshift' as SqlDialect);

        // CTE must appear AFTER 'AS', not before 'CREATE TABLE'
        // Valid:   CREATE TABLE ... AS WITH recent_events AS (...) SELECT ...
        // Invalid: WITH recent_events AS (...) CREATE TABLE ... AS SELECT ...
        expect(rewritten).toContain('CREATE TABLE analytics.daily_users AS WITH recent_events AS');
        expect(rewritten).toContain('SELECT DISTINCT user_id');
        expect(rewritten).toContain('FROM recent_events');
        expect(rewritten).not.toMatch(/WITH\s+recent_events.*CREATE\s+TABLE/is);
    });

    it('parses CTE-based Redshift SELECT INTO without partial fallback', () => {
        const sql = `
            WITH recent_events AS (
                SELECT user_id
                FROM raw_events
            )
            SELECT DISTINCT user_id
            INTO analytics.daily_users
            FROM recent_events
        `;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const root = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'TABLE analytics.daily_users'
            && node.operationType === 'CREATE_TABLE_AS'
        );
        // CTE reference: recent_events is the direct source of the outer SELECT
        const cteRef = result.nodes.find((node: any) => node.label === 'recent_events');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(root).toBeDefined();
        expect(cteRef).toBeDefined();
    });

    it('parses late-binding Redshift views without partial fallback', () => {
        const sql = `
            CREATE VIEW analytics.active_sales AS
            SELECT * FROM sales
            WITH NO SCHEMA BINDING
        `;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const root = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'VIEW analytics.active_sales'
            && node.operationType === 'CREATE_VIEW'
        );
        const source = result.nodes.find((node: any) => node.type === 'table' && node.label === 'sales');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(root).toBeDefined();
        expect(source).toBeDefined();
    });

    it('parses Redshift CTAS with distribution and sort options', () => {
        const sql = `
            CREATE TABLE analytics.sales_by_customer
            DISTSTYLE KEY
            DISTKEY(customer_id)
            SORTKEY(sale_date)
            AS
            SELECT customer_id, sale_date
            FROM sales
        `;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const root = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'TABLE analytics.sales_by_customer'
            && node.operationType === 'CREATE_TABLE_AS'
        );
        const source = result.nodes.find((node: any) => node.type === 'table' && node.label === 'sales');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(root?.details).toEqual(expect.arrayContaining([
            'DISTSTYLE: KEY',
            'DISTKEY: customer_id',
            'SORTKEY: sale_date'
        ]));
        expect(source).toBeDefined();
        expect(result.hints.some((hint: any) => hint.message.includes('Redshift CREATE TABLE AS with physical options'))).toBe(true);
    });

    it('parses Redshift Spectrum external tables with location details', () => {
        const sql = `
            CREATE EXTERNAL TABLE spectrum.sales (
                id INT,
                amount DECIMAL(10,2)
            )
            STORED AS PARQUET
            LOCATION 's3://warehouse/sales/'
        `;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const target = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'spectrum.sales'
            && node.accessMode === 'write'
            && node.operationType === 'CREATE_TABLE'
        );
        const source = result.nodes.find((node: any) => node.label === 's3://warehouse/sales/');
        const root = result.nodes.find((node: any) => node.type === 'result' && node.label === 'CREATE EXTERNAL TABLE spectrum.sales');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(target).toBeDefined();
        expect(source).toBeDefined();
        expect(root?.details).toEqual(expect.arrayContaining([
            'Columns: 2',
            'Format: PARQUET',
            'Location: s3://warehouse/sales/'
        ]));
    });

    it('rewrites multi-CTE SELECT INTO correctly', () => {
        const sql = `
            WITH
            step1 AS (SELECT id FROM source_a),
            step2 AS (SELECT id FROM source_b)
            SELECT step1.id
            INTO staging.combined
            FROM step1 JOIN step2 ON step1.id = step2.id
        `;

        const { sql: rewritten } = preprocessForParsing(sql, 'Redshift' as SqlDialect);

        expect(rewritten).toMatch(/CREATE\s+TABLE\s+staging\.combined\s+AS\s+WITH/i);
        expect(rewritten).not.toMatch(/WITH\s+step1.*CREATE\s+TABLE/is);
    });
});
