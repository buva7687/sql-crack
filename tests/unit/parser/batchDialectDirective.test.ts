import { parseSqlBatch } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('batch inline dialect directives', () => {
    it('honors per-statement dialect markers in mixed-dialect example batches', () => {
        const sql = `
            -- Dialect: PostgreSQL
            TRUNCATE TABLE order_staging RESTART IDENTITY CASCADE;

            -- Dialect: TransactSQL
            DROP INDEX idx_orders_date ON dbo.orders;

            -- Dialect: Hive
            CREATE EXTERNAL TABLE IF NOT EXISTS sales_partitioned (
                sale_id BIGINT,
                customer_id INT,
                product_id INT,
                amount DECIMAL(12,2),
                quantity INT
            )
            PARTITIONED BY (sale_date STRING, region STRING)
            STORED AS PARQUET
            LOCATION 's3://analytics-warehouse/sales/'
            TBLPROPERTIES ('parquet.compression'='SNAPPY');

            -- Dialect: BigQuery
            CREATE TABLE analytics.daily_sales
            PARTITION BY DATE(sale_date)
            CLUSTER BY region, product_category
            AS SELECT
                sale_date,
                region,
                product_category,
                SUM(amount) AS total_amount,
                COUNT(*) AS transaction_count
            FROM raw_sales
            GROUP BY sale_date, region, product_category;

            -- Dialect: Trino
            CREATE TABLE hive.analytics.user_sessions (
                session_id VARCHAR,
                user_id BIGINT,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                page_views INTEGER
            )
            WITH (
                format = 'PARQUET',
                external_location = 's3://warehouse/user_sessions/',
                partitioned_by = ARRAY['start_time']
            );
        `;

        const batch = parseSqlBatch(sql, 'MySQL' as SqlDialect);

        expect(batch.queries).toHaveLength(5);
        expect(batch.queries.every(query => !query.error && !query.partial)).toBe(true);

        const truncateQuery = batch.queries[0];
        expect(truncateQuery.nodes.some((node: any) =>
            node.type === 'result' && node.label === 'TRUNCATE TABLE order_staging'
        )).toBe(true);

        const dropIndexQuery = batch.queries[1];
        expect(dropIndexQuery.nodes.some((node: any) =>
            node.type === 'result' && node.label === 'DROP INDEX idx_orders_date'
        )).toBe(true);

        const externalTableQuery = batch.queries[2];
        expect(externalTableQuery.hints.some((hint: any) =>
            hint.message?.includes('Hive CREATE EXTERNAL TABLE')
        )).toBe(true);
        expect(externalTableQuery.nodes.some((node: any) =>
            node.label === 's3://analytics-warehouse/sales/' && node.accessMode === 'read'
        )).toBe(true);

        const bigQueryCtas = batch.queries[3];
        const ctasNode = bigQueryCtas.nodes.find((node: any) =>
            node.type === 'result' && node.label === 'TABLE analytics.daily_sales'
        );
        expect(ctasNode?.details).toEqual(expect.arrayContaining([
            expect.stringContaining('PARTITION BY:'),
            'CLUSTER BY: region, product_category'
        ]));

        const trinoCreate = batch.queries[4];
        expect(trinoCreate.hints.some((hint: any) =>
            hint.message?.includes('Trino CREATE TABLE ... WITH')
        )).toBe(true);
        expect(trinoCreate.nodes.some((node: any) =>
            node.label === 's3://warehouse/user_sessions/' && node.accessMode === 'read'
        )).toBe(true);
    });
});
