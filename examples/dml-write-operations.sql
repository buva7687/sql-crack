-- ============================================================
-- DML Write Operations - INSERT, UPDATE, DELETE, MERGE
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
--
-- Use these examples to test:
--   - Write operation badges (INSERT=green, UPDATE=yellow, DELETE=red)
--   - Data flow visualization for writes
--   - Anti-pattern warnings (DELETE without WHERE)
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
