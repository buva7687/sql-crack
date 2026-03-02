-- ============================================================
-- DDL & Warehouse DDL Operations
-- ============================================================
-- Exercises the rich DDL visualization (ALTER, DROP, TRUNCATE)
-- and warehouse/external DDL compatibility parsers.
--
-- Sections:
--   Q1-Q4:   CREATE TABLE with FK references and details
--   Q5-Q7:   ALTER TABLE actions
--   Q8-Q10:  DROP / TRUNCATE
--   Q11-Q12: Hive/Athena EXTERNAL TABLE
--   Q13-Q14: BigQuery EXTERNAL TABLE and CTAS options
--   Q15:     Trino CREATE TABLE ... WITH
--   Q16-Q18: Snowflake STAGE / STREAM / TASK
--   Q19:     Redshift physical options
-- ============================================================

-- ============================================================
-- CREATE TABLE with Foreign Key References
-- ============================================================

-- Q1: Basic table with inline FK reference (MySQL)
CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    customer_id INT REFERENCES customers(customer_id),
    order_date DATE NOT NULL,
    total DECIMAL(10,2) DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
);

-- Q2: Table with named constraints and multiple FKs
CREATE TABLE order_items (
    item_id INT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
    CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Q3: CREATE TABLE AS SELECT (CTAS)
CREATE TABLE archived_orders AS
SELECT * FROM orders WHERE status = 'completed' AND order_date < '2024-01-01';

-- Q4: CREATE VIEW with SELECT
CREATE VIEW active_customers AS
SELECT c.customer_id, c.name, COUNT(o.order_id) AS order_count
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE c.status = 'active'
GROUP BY c.customer_id, c.name;

-- ============================================================
-- ALTER TABLE Operations
-- ============================================================

-- Q5: ALTER with ADD COLUMN and ADD CONSTRAINT
ALTER TABLE orders
    ADD COLUMN archived_at DATETIME,
    ADD CONSTRAINT fk_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id);

-- Q6: ALTER with DROP COLUMN
ALTER TABLE orders
    DROP COLUMN legacy_status;

-- Q7: ALTER with multiple mixed actions
ALTER TABLE customers
    ADD COLUMN loyalty_tier VARCHAR(20),
    ADD COLUMN referral_code VARCHAR(50) UNIQUE,
    DROP COLUMN temp_flag;

-- ============================================================
-- DROP and TRUNCATE
-- ============================================================

-- Q8: DROP TABLE with multiple targets
DROP TABLE IF EXISTS temp_orders, temp_order_items;

-- Q9: TRUNCATE with PostgreSQL options
-- Dialect: PostgreSQL
TRUNCATE TABLE order_staging RESTART IDENTITY CASCADE;

-- Q10: DROP INDEX with parent table
-- Dialect: TransactSQL
DROP INDEX idx_orders_date ON dbo.orders;

-- ============================================================
-- Hive / Athena External Tables
-- ============================================================

-- Q11: Hive EXTERNAL TABLE with LOCATION and ROW FORMAT
-- Dialect: Hive
CREATE EXTERNAL TABLE clickstream_events (
    event_id STRING,
    user_id STRING,
    event_type STRING,
    event_timestamp TIMESTAMP,
    page_url STRING,
    referrer STRING,
    device_type STRING
)
ROW FORMAT DELIMITED
FIELDS TERMINATED BY '\t'
STORED AS TEXTFILE
LOCATION 's3://data-lake/clickstream/raw/'
TBLPROPERTIES ('skip.header.line.count'='1', 'serialization.null.format'='');

-- Q12: Athena EXTERNAL TABLE with Parquet
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

-- ============================================================
-- BigQuery External Tables and CTAS
-- ============================================================

-- Q13: BigQuery EXTERNAL TABLE with OPTIONS
-- Dialect: BigQuery
CREATE EXTERNAL TABLE dataset.access_logs
OPTIONS (
    format = 'CSV',
    uris = ['gs://my-bucket/logs/2024/*.csv', 'gs://my-bucket/logs/2025/*.csv'],
    skip_leading_rows = 1
);

-- Q14: BigQuery CTAS with PARTITION and CLUSTER
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

-- ============================================================
-- Trino CREATE TABLE ... WITH
-- ============================================================

-- Q15: Trino table with external location and format
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

-- ============================================================
-- Snowflake STAGE / STREAM / TASK
-- ============================================================

-- Q16: Snowflake CREATE STAGE with external URL
-- Dialect: Snowflake
CREATE OR REPLACE STAGE raw_data_stage
URL = 's3://company-data-lake/ingest/'
STORAGE_INTEGRATION = s3_integration
FILE_FORMAT = (TYPE = 'CSV' FIELD_DELIMITER = ',' SKIP_HEADER = 1);

-- Q17: Snowflake CREATE STREAM on table
-- Dialect: Snowflake
CREATE OR REPLACE STREAM orders_cdc_stream ON TABLE production.orders;

-- Q18: Snowflake CREATE TASK with schedule and body
-- Dialect: Snowflake
CREATE OR REPLACE TASK nightly_aggregation
WAREHOUSE = etl_warehouse
SCHEDULE = 'USING CRON 0 2 * * * America/New_York'
AS INSERT INTO daily_order_summary
   SELECT order_date, COUNT(*), SUM(total)
   FROM orders
   WHERE order_date = CURRENT_DATE - 1
   GROUP BY order_date;

-- ============================================================
-- Redshift Physical Options
-- ============================================================

-- Q19: Redshift CREATE TABLE with distribution and sort keys
-- Dialect: Redshift
CREATE TABLE fact_transactions (
    transaction_id BIGINT NOT NULL,
    customer_id INT NOT NULL,
    product_id INT NOT NULL,
    store_id INT NOT NULL,
    transaction_date DATE NOT NULL,
    amount DECIMAL(12,2),
    quantity INT
)
DISTSTYLE KEY
DISTKEY(customer_id)
COMPOUND SORTKEY(transaction_date, store_id);
