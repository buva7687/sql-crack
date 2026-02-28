import { parseSql, parseSqlBatch } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('warehouse DDL visualization', () => {
    it('renders Hive CREATE EXTERNAL TABLE with location details', () => {
        const sql = `
            CREATE EXTERNAL TABLE events (
                id INT,
                payload STRING
            )
            ROW FORMAT DELIMITED
            FIELDS TERMINATED BY ','
            LOCATION 's3://bucket/path'
            TBLPROPERTIES ('skip.header.line.count'='1')
        `;
        const result = parseSql(sql, 'Hive' as SqlDialect);

        const target = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'events'
            && node.accessMode === 'write'
            && node.operationType === 'CREATE_TABLE'
        );
        const location = result.nodes.find((node: any) =>
            node.label === 's3://bucket/path'
            && node.accessMode === 'read'
        );
        const root = result.nodes.find((node: any) => node.type === 'result' && node.label === 'CREATE EXTERNAL TABLE events');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(target).toBeDefined();
        expect(location).toBeDefined();
        expect(root?.details).toEqual(expect.arrayContaining([
            'Columns: 2',
            'Location: s3://bucket/path',
            expect.stringContaining('TBLPROPERTIES:')
        ]));
    });

    it('renders BigQuery CREATE EXTERNAL TABLE with URI sources', () => {
        const sql = `
            CREATE EXTERNAL TABLE dataset.logs
            OPTIONS (
                format = 'CSV',
                uris = ['gs://bucket/logs/*.csv']
            )
        `;
        const result = parseSql(sql, 'BigQuery' as SqlDialect);

        const target = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'dataset.logs'
            && node.accessMode === 'write'
            && node.operationType === 'CREATE_TABLE'
        );
        const source = result.nodes.find((node: any) => node.label === 'gs://bucket/logs/*.csv');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(target).toBeDefined();
        expect(source).toBeDefined();
        expect(result.hints.some((hint: any) => hint.message.includes('BigQuery CREATE EXTERNAL TABLE'))).toBe(true);
    });

    it('surfaces BigQuery partition and cluster options on CTAS', () => {
        const sql = `
            CREATE TABLE dataset.sales
            PARTITION BY DATE(created_at)
            CLUSTER BY customer_id
            AS SELECT * FROM raw_sales
        `;
        const result = parseSql(sql, 'BigQuery' as SqlDialect);

        const root = result.nodes.find((node: any) =>
            node.type === 'result'
            && node.label === 'TABLE dataset.sales'
            && node.operationType === 'CREATE_TABLE_AS'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(root?.details).toEqual(expect.arrayContaining([
            expect.stringContaining('PARTITION BY:'),
            'CLUSTER BY: customer_id'
        ]));
    });

    it('renders Trino CREATE TABLE ... WITH (...) details and location', () => {
        const sql = `
            CREATE TABLE hive.sales (
                id BIGINT
            )
            WITH (
                format = 'PARQUET',
                external_location = 's3://warehouse/sales/'
            )
        `;
        const result = parseSql(sql, 'Trino' as SqlDialect);

        const target = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'hive.sales'
            && node.accessMode === 'write'
        );
        const source = result.nodes.find((node: any) => node.label === 's3://warehouse/sales/');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(target).toBeDefined();
        expect(source).toBeDefined();
        expect(result.hints.some((hint: any) => hint.message.includes('Trino CREATE TABLE ... WITH'))).toBe(true);
    });

    it('renders Snowflake CREATE STAGE with URL source', () => {
        const sql = `CREATE STAGE ext_stage URL = 's3://bucket/path/'`;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);

        const target = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'ext_stage'
            && node.operationType === 'CREATE_OBJECT'
        );
        const source = result.nodes.find((node: any) => node.label === 's3://bucket/path/');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(target).toBeDefined();
        expect(source).toBeDefined();
    });

    it('renders Snowflake CREATE STREAM with source table flow', () => {
        const sql = 'CREATE STREAM order_stream ON TABLE orders';
        const result = parseSql(sql, 'Snowflake' as SqlDialect);

        const source = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'orders'
            && node.accessMode === 'read'
        );
        const target = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'order_stream'
            && node.operationType === 'CREATE_OBJECT'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(source).toBeDefined();
        expect(target).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === source?.id && edge.target === target?.id)).toBe(true);
    });

    it('renders Snowflake CREATE TASK details', () => {
        const sql = `
            CREATE TASK nightly_task
            WAREHOUSE = etl_wh
            SCHEDULE = 'USING CRON 0 0 * * * UTC'
            AS INSERT INTO audit_log SELECT 1
        `;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);

        const target = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'nightly_task'
            && node.operationType === 'CREATE_OBJECT'
        );
        const root = result.nodes.find((node: any) => node.type === 'result' && node.label === 'CREATE TASK nightly_task');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(target).toBeDefined();
        expect(root?.details).toEqual(expect.arrayContaining([
            'Warehouse: etl_wh',
            'Schedule: USING CRON 0 0 * * * UTC',
            expect.stringContaining('Body: INSERT INTO audit_log SELECT 1')
        ]));
    });

    it('renders Redshift CREATE TABLE physical options', () => {
        const sql = `
            CREATE TABLE sales (
                id INT,
                customer_id INT
            )
            DISTSTYLE KEY
            DISTKEY(customer_id)
            SORTKEY(id)
        `;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const root = result.nodes.find((node: any) => node.type === 'result' && node.label === 'CREATE TABLE sales');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(root?.details).toEqual(expect.arrayContaining([
            'Columns: 2',
            'DISTSTYLE: KEY',
            'DISTKEY: customer_id',
            'SORTKEY: id'
        ]));
    });

    it('merges Snowflake warehouse DDL in batch mode', () => {
        const sql = `
            CREATE STAGE ext_stage URL = 's3://bucket/path/';
            CREATE STREAM order_stream ON TABLE orders;
        `;
        const result = parseSqlBatch(sql, 'Snowflake' as SqlDialect, undefined, { combineDdlStatements: true });

        expect(result.queries).toHaveLength(1);
        expect(result.queries[0].nodes[0]?.label).toBe('Schema Changes');
        expect(result.queries[0].hints[0]?.message).toContain('CREATE STAGE');
        expect(result.queries[0].hints[0]?.message).toContain('CREATE STREAM');
    });
});
