import { parseSql, parseSqlBatch } from '../../../src/webview/sqlParser';
import { getSessionCommandInfo } from '../../../src/webview/parser/statements/ddl';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Bulk operation visualization', () => {
    it('renders PostgreSQL COPY FROM as external source into write target', () => {
        const sql = `COPY users FROM 's3://bucket/users.csv' WITH (FORMAT csv, HEADER true)`;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const sourceNode = result.nodes.find((node: any) => node.label === 's3://bucket/users.csv');
        const targetNode = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'users'
            && node.accessMode === 'write'
            && node.operationType === 'INSERT'
        );
        const resultNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'COPY users');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceNode).toBeDefined();
        expect(targetNode).toBeDefined();
        expect(resultNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === sourceNode?.id && edge.target === targetNode?.id)).toBe(true);
        expect(result.edges.some((edge: any) => edge.source === targetNode?.id && edge.target === resultNode?.id)).toBe(true);
    });

    it('renders PostgreSQL COPY query export with inner SELECT flow', () => {
        const sql = `
            COPY (
                SELECT id, name
                FROM users
                WHERE active = true
            ) TO 's3://bucket/active-users.csv'
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'users' && !node.accessMode);
        const destinationNode = result.nodes.find((node: any) => node.label === 's3://bucket/active-users.csv');
        const resultNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'COPY TO');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(destinationNode).toBeDefined();
        expect(resultNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.target === destinationNode?.id)).toBe(true);
        expect(result.edges.some((edge: any) => edge.source === destinationNode?.id && edge.target === resultNode?.id)).toBe(true);
    });

    it('renders PostgreSQL COPY table export to STDOUT', () => {
        const sql = `COPY users TO STDOUT`;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'users' && node.accessMode === 'read');
        const destinationNode = result.nodes.find((node: any) => node.label === 'STDOUT');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(destinationNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === sourceTable?.id && edge.target === destinationNode?.id)).toBe(true);
    });

    it('renders Snowflake COPY INTO table from stage', () => {
        const sql = `COPY INTO customer_dim FROM @raw_stage/customers FILE_FORMAT = (TYPE = CSV)`;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);

        const sourceNode = result.nodes.find((node: any) => node.label === '@raw_stage/customers');
        const targetNode = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'customer_dim'
            && node.accessMode === 'write'
            && node.operationType === 'INSERT'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceNode).toBeDefined();
        expect(targetNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === sourceNode?.id && edge.target === targetNode?.id)).toBe(true);
    });

    it('renders Snowflake COPY INTO stage from SELECT', () => {
        const sql = `
            COPY INTO @analytics_stage/orders_export
            FROM (
                SELECT order_id, total_amount
                FROM orders
            )
        `;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'orders' && !node.accessMode);
        const destinationNode = result.nodes.find((node: any) => node.label === '@analytics_stage/orders_export');
        const resultNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'COPY INTO @analytics_stage/orders_export');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(destinationNode).toBeDefined();
        expect(resultNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.target === destinationNode?.id)).toBe(true);
        expect(result.edges.some((edge: any) => edge.source === destinationNode?.id && edge.target === resultNode?.id)).toBe(true);
    });

    it('renders Redshift UNLOAD with embedded SELECT', () => {
        const sql = `UNLOAD ('SELECT event_id, user_id FROM events') TO 's3://warehouse/events/' IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-unload'`;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'events' && !node.accessMode);
        const destinationNode = result.nodes.find((node: any) => node.label === 's3://warehouse/events/');
        const resultNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'UNLOAD');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(destinationNode).toBeDefined();
        expect(resultNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === destinationNode?.id && edge.target === resultNode?.id)).toBe(true);
    });

    it('renders Redshift COPY import from S3 into a write target', () => {
        const sql = `COPY fact_events FROM 's3://warehouse/events/' IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-copy'`;
        const result = parseSql(sql, 'Redshift' as SqlDialect);

        const sourceNode = result.nodes.find((node: any) => node.label === 's3://warehouse/events/');
        const targetNode = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'fact_events'
            && node.accessMode === 'write'
            && node.operationType === 'INSERT'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceNode).toBeDefined();
        expect(targetNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === sourceNode?.id && edge.target === targetNode?.id)).toBe(true);
    });

    it('renders BigQuery EXPORT DATA with SELECT source', () => {
        const sql = `
            EXPORT DATA OPTIONS(
                uri='gs://analytics-bucket/orders/*.csv',
                format='CSV',
                overwrite=true
            ) AS
            SELECT order_id, order_ts
            FROM orders
        `;
        const result = parseSql(sql, 'BigQuery' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'orders' && !node.accessMode);
        const destinationNode = result.nodes.find((node: any) => node.label === 'gs://analytics-bucket/orders/*.csv');
        const resultNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'EXPORT DATA');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(destinationNode).toBeDefined();
        expect(resultNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === destinationNode?.id && edge.target === resultNode?.id)).toBe(true);
    });

    it('renders MySQL LOAD DATA as file source into write target', () => {
        const sql = `LOAD DATA LOCAL INFILE '/tmp/users.csv' INTO TABLE users FIELDS TERMINATED BY ','`;
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        const sourceNode = result.nodes.find((node: any) => node.label === '/tmp/users.csv');
        const targetNode = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'users'
            && node.accessMode === 'write'
            && node.operationType === 'INSERT'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceNode).toBeDefined();
        expect(targetNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === sourceNode?.id && edge.target === targetNode?.id)).toBe(true);
    });

    it('renders Hive LOAD DATA INPATH into a write target', () => {
        const sql = `LOAD DATA INPATH 's3://landing/users/' INTO TABLE users`;
        const result = parseSql(sql, 'Hive' as SqlDialect);

        const sourceNode = result.nodes.find((node: any) => node.label === 's3://landing/users/');
        const targetNode = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'users'
            && node.accessMode === 'write'
            && node.operationType === 'INSERT'
        );

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceNode).toBeDefined();
        expect(targetNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === sourceNode?.id && edge.target === targetNode?.id)).toBe(true);
    });

    it('renders Hive INSERT OVERWRITE TABLE with source query flow', () => {
        const sql = `
            INSERT OVERWRITE TABLE daily_sales
            SELECT sale_id, amount
            FROM staging_sales
        `;
        const result = parseSql(sql, 'Hive' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'staging_sales' && !node.accessMode);
        const targetNode = result.nodes.find((node: any) =>
            node.type === 'table'
            && node.label === 'daily_sales'
            && node.accessMode === 'write'
            && node.operationType === 'INSERT'
        );
        const resultNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'INSERT OVERWRITE daily_sales');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(targetNode).toBeDefined();
        expect(resultNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.target === targetNode?.id)).toBe(true);
        expect(result.edges.some((edge: any) => edge.source === targetNode?.id && edge.target === resultNode?.id)).toBe(true);
    });

    it('renders Hive INSERT OVERWRITE DIRECTORY as query export', () => {
        const sql = `
            INSERT OVERWRITE DIRECTORY 's3://warehouse/daily_sales/'
            SELECT sale_id, amount
            FROM staging_sales
        `;
        const result = parseSql(sql, 'Hive' as SqlDialect);

        const sourceTable = result.nodes.find((node: any) => node.type === 'table' && node.label === 'staging_sales' && !node.accessMode);
        const destinationNode = result.nodes.find((node: any) => node.label === 's3://warehouse/daily_sales/');
        const resultNode = result.nodes.find((node: any) => node.type === 'result' && node.label === 'INSERT OVERWRITE DIRECTORY');

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(sourceTable).toBeDefined();
        expect(destinationNode).toBeDefined();
        expect(resultNode).toBeDefined();
        expect(result.edges.some((edge: any) => edge.source === destinationNode?.id && edge.target === resultNode?.id)).toBe(true);
    });

    it('does not classify bulk operations as session commands', () => {
        expect(getSessionCommandInfo(`COPY users FROM 's3://bucket/users.csv'`, 'PostgreSQL' as SqlDialect)).toBeNull();
        expect(getSessionCommandInfo(`EXPORT DATA OPTIONS(uri='gs://bucket/out/*.csv') AS SELECT * FROM orders`, 'BigQuery' as SqlDialect)).toBeNull();
        expect(getSessionCommandInfo(`LOAD DATA LOCAL INFILE '/tmp/users.csv' INTO TABLE users`, 'MySQL' as SqlDialect)).toBeNull();
    });

    it('does not merge bulk operations into batch session setup', () => {
        const sql = `
            COPY users FROM 's3://bucket/users.csv';
            COPY archive_users FROM 's3://bucket/archive_users.csv';
        `;
        const result = parseSqlBatch(sql, 'PostgreSQL' as SqlDialect);

        expect(result.queries).toHaveLength(2);
        expect(result.queries.every(query => query.nodes.some((node: any) => node.type === 'result' && node.label.startsWith('COPY')))).toBe(true);
        expect(result.queries.some(query => query.nodes.some((node: any) => node.label === 'Session Setup'))).toBe(false);
    });
});
