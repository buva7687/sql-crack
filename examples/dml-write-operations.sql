-- ============================================================
-- DML Write Operations - INSERT, UPDATE, DELETE, MERGE, UPSERT
-- ============================================================
-- This file demonstrates write operations for visualization
--
-- Features covered:
--   1. INSERT statements (single and bulk)
--   2. INSERT ... SELECT
--   3. UPDATE with conditions
--   4. UPDATE with JOINs
--   5. DELETE with conditions
--   6. DELETE with subqueries
--   7. MERGE (upsert) operations
--   8. CREATE TABLE AS SELECT (CTAS)
--   9. UPSERT: PostgreSQL ON CONFLICT DO NOTHING / DO UPDATE
--  10. UPSERT: MySQL/MariaDB ON DUPLICATE KEY UPDATE
--  11. UPSERT: SQLite INSERT OR REPLACE / INSERT OR IGNORE
--  12. MERGE: multi-dialect structured parsing (TransactSQL,
--      Oracle, Snowflake, BigQuery, Teradata, PostgreSQL)
--
-- Use these examples to test:
--   - Write operation badges (INSERT=green, UPDATE=yellow, DELETE=red)
--   - Data flow visualization for writes
--   - Anti-pattern warnings (DELETE without WHERE)
--   - UPSERT result nodes with conflict semantics
--   - MERGE compatibility parser (non-partial, real edges)
-- ============================================================

-- ============================================================
-- 1. Simple INSERT (Single Row)
-- ============================================================
INSERT INTO customers (customer_id, customer_name, email, region, registration_date, status)
VALUES (1001, 'John Smith', 'john.smith@example.com', 'North', CURRENT_DATE, 'active');

-- ============================================================
-- 2. Bulk INSERT (Multiple Rows)
-- ============================================================
INSERT INTO products (product_id, product_name, sku, category, price, active)
VALUES
    (2001, 'Wireless Mouse', 'WM-001', 'Electronics', 29.99, TRUE),
    (2002, 'USB Keyboard', 'KB-001', 'Electronics', 49.99, TRUE),
    (2003, 'Monitor Stand', 'MS-001', 'Accessories', 39.99, TRUE),
    (2004, 'Webcam HD', 'WC-001', 'Electronics', 79.99, TRUE);

-- ============================================================
-- 3. INSERT ... SELECT (Copy from query)
-- ============================================================
INSERT INTO daily_sales_summary (report_date, total_orders, total_revenue, unique_customers, avg_order_value)
SELECT
    DATE(order_date) AS report_date,
    COUNT(*) AS total_orders,
    SUM(total_amount) AS total_revenue,
    COUNT(DISTINCT customer_id) AS unique_customers,
    AVG(total_amount) AS avg_order_value
FROM orders
WHERE order_date >= CURRENT_DATE - INTERVAL '1 day'
    AND order_date < CURRENT_DATE
    AND status = 'completed'
GROUP BY DATE(order_date);

-- ============================================================
-- 4. INSERT ... SELECT with Transformation
-- ============================================================
INSERT INTO customer_feedback (customer_id, rating, category, comment, created_at)
SELECT
    r.customer_id,
    r.rating,
    CASE
        WHEN r.rating >= 4 THEN 'Positive'
        WHEN r.rating >= 3 THEN 'Neutral'
        ELSE 'Negative'
    END AS category,
    r.comment,
    r.created_at
FROM reviews r
WHERE r.created_at >= CURRENT_DATE - INTERVAL '7 days'
    AND r.verified_purchase = TRUE;

-- ============================================================
-- 5. Simple UPDATE
-- ============================================================
UPDATE customers
SET
    tier = 'Gold',
    updated_at = CURRENT_TIMESTAMP
WHERE customer_id = 1001;

-- ============================================================
-- 6. UPDATE with Conditions
-- ============================================================
UPDATE products
SET
    price = price * 0.9,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'Electronics'
    AND active = TRUE
    AND launch_date < CURRENT_DATE - INTERVAL '1 year';

-- ============================================================
-- 7. UPDATE with Subquery
-- ============================================================
UPDATE customers
SET tier = 'Platinum'
WHERE customer_id IN (
    SELECT customer_id
    FROM orders
    GROUP BY customer_id
    HAVING SUM(total_amount) > 50000
);

-- ============================================================
-- 8. UPDATE with JOIN (PostgreSQL syntax)
-- ============================================================
UPDATE order_items oi
SET
    unit_price = p.price,
    updated_at = CURRENT_TIMESTAMP
FROM products p
WHERE oi.product_id = p.product_id
    AND oi.unit_price != p.price
    AND oi.order_id IN (
        SELECT order_id
        FROM orders
        WHERE status = 'pending'
    );

-- ============================================================
-- 9. UPDATE with CASE
-- ============================================================
UPDATE customers
SET tier = CASE
    WHEN lifetime_value >= 50000 THEN 'Platinum'
    WHEN lifetime_value >= 20000 THEN 'Gold'
    WHEN lifetime_value >= 5000 THEN 'Silver'
    ELSE 'Basic'
END,
updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT
        customer_id,
        SUM(total_amount) AS lifetime_value
    FROM orders
    WHERE status = 'completed'
    GROUP BY customer_id
) AS customer_totals
WHERE customers.customer_id = customer_totals.customer_id;

-- ============================================================
-- 10. Simple DELETE
-- ============================================================
DELETE FROM order_items
WHERE order_id = 12345;

-- ============================================================
-- 11. DELETE with Conditions
-- ============================================================
DELETE FROM orders
WHERE status = 'cancelled'
    AND order_date < CURRENT_DATE - INTERVAL '1 year';

-- ============================================================
-- 12. DELETE with Subquery
-- ============================================================
DELETE FROM customer_feedback
WHERE customer_id IN (
    SELECT customer_id
    FROM customers
    WHERE status = 'suspended'
);

-- ============================================================
-- 13. DELETE with EXISTS
-- ============================================================
DELETE FROM order_items oi
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.order_id = oi.order_id
        AND o.status = 'cancelled'
        AND o.order_date < CURRENT_DATE - INTERVAL '90 days'
);

-- ============================================================
-- 14. MERGE (Upsert) - PostgreSQL ON CONFLICT
-- ============================================================
INSERT INTO daily_sales_summary (report_date, total_orders, total_revenue, unique_customers)
SELECT
    DATE(order_date) AS report_date,
    COUNT(*) AS total_orders,
    SUM(total_amount) AS total_revenue,
    COUNT(DISTINCT customer_id) AS unique_customers
FROM orders
WHERE DATE(order_date) = CURRENT_DATE
    AND status = 'completed'
GROUP BY DATE(order_date)
ON CONFLICT (report_date)
DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    total_revenue = EXCLUDED.total_revenue,
    unique_customers = EXCLUDED.unique_customers,
    created_at = CURRENT_TIMESTAMP;

-- ============================================================
-- 15. MERGE (Standard SQL syntax)
-- ============================================================
MERGE INTO inventory AS target
USING (
    SELECT
        product_id,
        SUM(quantity) AS ordered_quantity
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.order_id
    WHERE o.status = 'completed'
        AND o.order_date = CURRENT_DATE
    GROUP BY product_id
) AS source
ON target.product_id = source.product_id
WHEN MATCHED THEN
    UPDATE SET
        stock_quantity = target.stock_quantity - source.ordered_quantity,
        last_stock_check = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN
    INSERT (product_id, warehouse_id, stock_quantity)
    VALUES (source.product_id, 1, -source.ordered_quantity);

-- ============================================================
-- 16. CREATE TABLE AS SELECT (CTAS)
-- ============================================================
CREATE TABLE customer_summary_2024 AS
SELECT
    c.customer_id,
    c.customer_name,
    c.region,
    c.tier,
    COUNT(o.order_id) AS total_orders,
    SUM(o.total_amount) AS total_revenue,
    AVG(o.total_amount) AS avg_order_value,
    MIN(o.order_date) AS first_order,
    MAX(o.order_date) AS last_order
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
    AND o.status = 'completed'
    AND EXTRACT(YEAR FROM o.order_date) = 2024
WHERE c.status = 'active'
GROUP BY c.customer_id, c.customer_name, c.region, c.tier;

-- ============================================================
-- WARNING EXAMPLES (Anti-patterns)
-- ============================================================

-- DELETE without WHERE (DANGEROUS - will delete all rows!)
-- This should trigger a warning badge
DELETE FROM temp_logs;

-- UPDATE without WHERE (DANGEROUS - will update all rows!)
-- This should trigger a warning badge
UPDATE products
SET discount_percent = 10;

-- ============================================================
-- 17. Complex Write with CTE
-- ============================================================
WITH orders_to_archive AS (
    SELECT order_id
    FROM orders
    WHERE status = 'completed'
        AND order_date < CURRENT_DATE - INTERVAL '2 years'
),
archived AS (
    INSERT INTO orders_archive
    SELECT o.*
    FROM orders o
    WHERE o.order_id IN (SELECT order_id FROM orders_to_archive)
    RETURNING order_id
)
DELETE FROM orders
WHERE order_id IN (SELECT order_id FROM archived);

-- ============================================================
-- UPSERT EXAMPLES
-- ============================================================
-- The following queries demonstrate first-class UPSERT
-- visualization. Each renders an explicit UPSERT result node
-- with conflict target, action, and SET columns in the
-- description — not a generic INSERT node.
-- ============================================================

-- ============================================================
-- 18. PostgreSQL ON CONFLICT DO NOTHING
-- ============================================================
-- Dialect: PostgreSQL
-- Expected: UPSERT node with "ON CONFLICT (email) | DO NOTHING"
INSERT INTO subscribers (email, name, subscribed_at)
VALUES ('alice@example.com', 'Alice', NOW())
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 19. PostgreSQL ON CONFLICT DO UPDATE
-- ============================================================
-- Dialect: PostgreSQL
-- Expected: UPSERT node with "ON CONFLICT (user_id) | DO UPDATE | SET: login_count, last_login"
INSERT INTO user_sessions (user_id, login_count, last_login, ip_address)
VALUES (42, 1, NOW(), '10.0.0.1')
ON CONFLICT (user_id) DO UPDATE SET
    login_count = user_sessions.login_count + 1,
    last_login = EXCLUDED.last_login,
    ip_address = EXCLUDED.ip_address;

-- ============================================================
-- 20. PostgreSQL ON CONFLICT with INSERT ... SELECT
-- ============================================================
-- Dialect: PostgreSQL
-- Expected: Source flow from orders → UPSERT node, preserving
--           the full SELECT graph upstream of the conflict clause
INSERT INTO daily_revenue (report_date, region, total_revenue, order_count)
SELECT
    DATE(o.order_date) AS report_date,
    c.region,
    SUM(o.total_amount) AS total_revenue,
    COUNT(*) AS order_count
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status = 'completed'
    AND o.order_date >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY DATE(o.order_date), c.region
ON CONFLICT (report_date, region) DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue,
    order_count = EXCLUDED.order_count,
    updated_at = NOW();

-- ============================================================
-- 21. MySQL ON DUPLICATE KEY UPDATE
-- ============================================================
-- Dialect: MySQL or MariaDB
-- Expected: UPSERT node with "ON DUPLICATE KEY UPDATE | SET: view_count, last_viewed"
INSERT INTO page_views (page_id, view_count, last_viewed)
VALUES (101, 1, NOW())
ON DUPLICATE KEY UPDATE
    view_count = view_count + 1,
    last_viewed = NOW();

-- ============================================================
-- 22. SQLite INSERT OR REPLACE
-- ============================================================
-- Dialect: SQLite
-- Expected: INSERT OR REPLACE node with "SQLite conflict resolution: REPLACE"
INSERT OR REPLACE INTO app_settings (key, value, updated_at)
VALUES ('theme', 'dark', datetime('now'));

-- ============================================================
-- 23. SQLite INSERT OR IGNORE
-- ============================================================
-- Dialect: SQLite
-- Expected: INSERT OR IGNORE node with "SQLite conflict resolution: IGNORE"
INSERT OR IGNORE INTO migration_log (version, applied_at)
VALUES ('v2.3.0', datetime('now'));

-- ============================================================
-- 24. SQLite ON CONFLICT DO UPDATE (proxied via PostgreSQL)
-- ============================================================
-- Dialect: SQLite
-- Expected: UPSERT node with "ON CONFLICT (key) | DO UPDATE | SET: value, updated_at"
--           Hint: "parsed using PostgreSQL-compatible conflict AST"
INSERT INTO cache_entries (key, value, updated_at)
VALUES ('user:42:profile', '{"name":"Alice"}', datetime('now'))
ON CONFLICT (key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at;

-- ============================================================
-- MERGE EXAMPLES (Compatibility Parser)
-- ============================================================
-- The following queries demonstrate the structured MERGE
-- compatibility parser. Each renders real merge_source and
-- merge_target edges, WHEN branch descriptions, and a
-- non-partial result — not the generic regex fallback.
-- ============================================================

-- ============================================================
-- 25. MERGE with direct table source (TransactSQL)
-- ============================================================
-- Dialect: TransactSQL
-- Expected: source_table → MERGE INTO inventory, with
--           merge_source/merge_target edges, WHEN branches,
--           and SET/INSERT columns in the description
MERGE INTO inventory AS tgt
USING warehouse_shipments AS src
ON tgt.sku = src.sku
WHEN MATCHED THEN
    UPDATE SET
        tgt.stock_quantity = tgt.stock_quantity + src.shipped_qty,
        tgt.last_restock = GETDATE()
WHEN NOT MATCHED THEN
    INSERT (sku, stock_quantity, warehouse_id, last_restock)
    VALUES (src.sku, src.shipped_qty, src.warehouse_id, GETDATE());

-- ============================================================
-- 26. MERGE with subquery source (Snowflake)
-- ============================================================
-- Dialect: Snowflake
-- Expected: orders + customers extracted from the subquery as
--           source nodes flowing into the MERGE result
MERGE INTO customer_metrics AS tgt
USING (
    SELECT
        o.customer_id,
        COUNT(*) AS order_count,
        SUM(o.total_amount) AS lifetime_value,
        MAX(o.order_date) AS last_order_date
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    WHERE o.status = 'completed'
    GROUP BY o.customer_id
) AS src
ON tgt.customer_id = src.customer_id
WHEN MATCHED THEN
    UPDATE SET
        tgt.order_count = src.order_count,
        tgt.lifetime_value = src.lifetime_value,
        tgt.last_order_date = src.last_order_date
WHEN NOT MATCHED THEN
    INSERT (customer_id, order_count, lifetime_value, last_order_date)
    VALUES (src.customer_id, src.order_count, src.lifetime_value, src.last_order_date);

-- ============================================================
-- 27. MERGE with CTE source (TransactSQL)
-- ============================================================
-- Dialect: TransactSQL
-- Expected: CTE node for active_subscriptions flowing into
--           the MERGE result via merge_source edge
WITH active_subscriptions AS (
    SELECT
        user_id,
        plan_name,
        renewal_date,
        monthly_rate
    FROM subscriptions
    WHERE status = 'active'
        AND renewal_date <= DATEADD(DAY, 7, GETDATE())
)
MERGE INTO billing_queue AS tgt
USING active_subscriptions AS src
ON tgt.user_id = src.user_id AND tgt.billing_month = MONTH(GETDATE())
WHEN MATCHED AND tgt.status = 'pending' THEN
    UPDATE SET
        tgt.amount = src.monthly_rate,
        tgt.plan_name = src.plan_name,
        tgt.updated_at = GETDATE()
WHEN NOT MATCHED THEN
    INSERT (user_id, billing_month, amount, plan_name, status, created_at)
    VALUES (src.user_id, MONTH(GETDATE()), src.monthly_rate, src.plan_name, 'pending', GETDATE());

-- ============================================================
-- 28. MERGE with multiple WHEN branches (BigQuery)
-- ============================================================
-- Dialect: BigQuery
-- Expected: WHEN branches include MATCHED→UPDATE,
--           NOT MATCHED BY TARGET→INSERT, NOT MATCHED BY SOURCE→DELETE
MERGE INTO product_catalog AS tgt
USING supplier_feed AS src
ON tgt.product_id = src.product_id
WHEN MATCHED AND src.discontinued = TRUE THEN
    DELETE
WHEN MATCHED THEN
    UPDATE SET
        tgt.price = src.price,
        tgt.description = src.description,
        tgt.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (product_id, name, price, description, created_at)
    VALUES (src.product_id, src.name, src.price, src.description, CURRENT_TIMESTAMP())
WHEN NOT MATCHED BY SOURCE THEN
    DELETE;

-- ============================================================
-- 29. MERGE with schema-qualified tables (Oracle)
-- ============================================================
-- Dialect: Oracle
-- Expected: Table names extracted without schema prefix,
--           ON condition displayed in the MERGE description
MERGE INTO sales.monthly_targets tgt
USING staging.sales_actuals src
ON tgt.sales_rep_id = src.sales_rep_id
    AND tgt.month = src.month
    AND tgt.year = src.year
WHEN MATCHED THEN
    UPDATE SET
        tgt.actual_revenue = src.actual_revenue,
        tgt.quota_pct = src.actual_revenue / tgt.target_revenue * 100
WHEN NOT MATCHED THEN
    INSERT (sales_rep_id, month, year, target_revenue, actual_revenue)
    VALUES (src.sales_rep_id, src.month, src.year, 0, src.actual_revenue);

-- ============================================================
-- 30. PostgreSQL MERGE (v15+)
-- ============================================================
-- Dialect: PostgreSQL
-- Expected: Compatibility parser (not fallback), with
--           merge_source/merge_target edges and non-partial result
MERGE INTO employee_directory AS tgt
USING hr_updates AS src
ON tgt.employee_id = src.employee_id
WHEN MATCHED AND src.action = 'terminate' THEN
    DELETE
WHEN MATCHED THEN
    UPDATE SET
        tgt.department = src.department,
        tgt.title = src.title,
        tgt.salary = src.salary,
        tgt.updated_at = NOW()
WHEN NOT MATCHED THEN
    INSERT (employee_id, name, department, title, salary, hire_date)
    VALUES (src.employee_id, src.name, src.department, src.title, src.salary, NOW());
