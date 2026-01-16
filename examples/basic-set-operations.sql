-- ============================================================
-- Set Operations - Comprehensive Examples
-- ============================================================
-- This file demonstrates UNION, INTERSECT, and EXCEPT patterns
--
-- Features covered:
--   1. UNION (deduplicated combination)
--   2. UNION ALL (with duplicates)
--   3. INTERSECT (common rows)
--   4. EXCEPT (difference)
--   5. Multiple set operations
--   6. Set operations with ORDER BY
--   7. Complex set operations with CTEs
--   8. Set operations for data consolidation
--
-- Use these examples to test:
--   - Set operation node visualization
--   - Multiple source combination
--   - Data flow from different tables
-- ============================================================

-- ============================================================
-- 1. Basic UNION (Remove Duplicates)
-- ============================================================
SELECT
    customer_id,
    'Customer' AS entity_type,
    customer_name AS name,
    email,
    region
FROM customers
WHERE status = 'active'

UNION

SELECT
    supplier_id,
    'Supplier' AS entity_type,
    supplier_name AS name,
    email,
    region
FROM suppliers
WHERE status = 'active'
ORDER BY entity_type, name;

-- ============================================================
-- 2. UNION ALL (Keep Duplicates - Better Performance)
-- ============================================================
SELECT
    'Order' AS source,
    order_id AS transaction_id,
    customer_id,
    total_amount AS amount,
    order_date AS transaction_date
FROM orders
WHERE status = 'completed'

UNION ALL

SELECT
    'Return' AS source,
    return_id AS transaction_id,
    customer_id,
    -refund_amount AS amount,
    return_date AS transaction_date
FROM order_returns
WHERE status = 'refunded'
ORDER BY transaction_date DESC;

-- ============================================================
-- 3. Multi-Table UNION ALL
-- ============================================================
SELECT
    'Order' AS source,
    order_id AS id,
    c.customer_name AS entity_name,
    total_amount AS amount,
    order_date AS created_at
FROM orders o
INNER JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status = 'pending'

UNION ALL

SELECT
    'Invoice' AS source,
    invoice_id AS id,
    v.vendor_name AS entity_name,
    invoice_amount AS amount,
    invoice_date AS created_at
FROM invoices i
INNER JOIN vendors v ON i.vendor_id = v.vendor_id
WHERE i.status = 'unpaid'

UNION ALL

SELECT
    'Refund' AS source,
    return_id AS id,
    c.customer_name AS entity_name,
    -refund_amount AS amount,
    return_date AS created_at
FROM order_returns r
INNER JOIN customers c ON r.customer_id = c.customer_id
WHERE r.status = 'processed'
ORDER BY created_at DESC;

-- ============================================================
-- 4. INTERSECT (Common Rows)
-- ============================================================
-- Find customers who have both placed orders AND left reviews
SELECT customer_id
FROM orders
WHERE status = 'completed'

INTERSECT

SELECT customer_id
FROM reviews
WHERE rating >= 4;

-- ============================================================
-- 5. EXCEPT (Difference)
-- ============================================================
-- Find customers who have placed orders but never left a review
SELECT DISTINCT customer_id
FROM orders
WHERE status = 'completed'

EXCEPT

SELECT DISTINCT customer_id
FROM reviews;

-- ============================================================
-- 6. Complex UNION with Aggregation
-- ============================================================
SELECT
    'Orders This Month' AS metric,
    COUNT(*) AS count,
    SUM(total_amount) AS total
FROM orders
WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND status = 'completed'

UNION ALL

SELECT
    'Orders Last Month' AS metric,
    COUNT(*) AS count,
    SUM(total_amount) AS total
FROM orders
WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    AND order_date < DATE_TRUNC('month', CURRENT_DATE)
    AND status = 'completed'

UNION ALL

SELECT
    'Returns This Month' AS metric,
    COUNT(*) AS count,
    SUM(refund_amount) AS total
FROM order_returns
WHERE return_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND status = 'refunded';

-- ============================================================
-- 7. UNION with CTE
-- ============================================================
WITH recent_buyers AS (
    SELECT DISTINCT customer_id
    FROM orders
    WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
        AND status = 'completed'
),
recent_reviewers AS (
    SELECT DISTINCT customer_id
    FROM reviews
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
    c.customer_name,
    c.email,
    'Buyer' AS activity_type
FROM customers c
WHERE c.customer_id IN (SELECT customer_id FROM recent_buyers)

UNION

SELECT
    c.customer_name,
    c.email,
    'Reviewer' AS activity_type
FROM customers c
WHERE c.customer_id IN (SELECT customer_id FROM recent_reviewers)
ORDER BY customer_name;

-- ============================================================
-- 8. Combining EXCEPT and UNION
-- ============================================================
-- Active customers who haven't ordered recently
(
    SELECT customer_id, customer_name, 'No Recent Orders' AS status
    FROM customers
    WHERE status = 'active'
        AND customer_id NOT IN (
            SELECT DISTINCT customer_id
            FROM orders
            WHERE order_date >= CURRENT_DATE - INTERVAL '90 days'
        )
)

UNION ALL

-- Customers with pending orders
(
    SELECT c.customer_id, c.customer_name, 'Has Pending Orders' AS status
    FROM customers c
    WHERE EXISTS (
        SELECT 1 FROM orders o
        WHERE o.customer_id = c.customer_id
            AND o.status = 'pending'
    )
)
ORDER BY status, customer_name;

-- ============================================================
-- 9. UNION for Historical Comparison
-- ============================================================
SELECT
    'Current Period' AS period,
    category,
    COUNT(*) AS product_count,
    AVG(price) AS avg_price
FROM products
WHERE active = TRUE
GROUP BY category

UNION ALL

SELECT
    'Discontinued' AS period,
    category,
    COUNT(*) AS product_count,
    AVG(price) AS avg_price
FROM products
WHERE active = FALSE
GROUP BY category
ORDER BY category, period;

-- ============================================================
-- 10. Complex Set Operations for Reporting
-- ============================================================
WITH
    high_value_customers AS (
        SELECT customer_id
        FROM orders
        GROUP BY customer_id
        HAVING SUM(total_amount) > 10000
    ),
    frequent_customers AS (
        SELECT customer_id
        FROM orders
        GROUP BY customer_id
        HAVING COUNT(*) > 20
    ),
    engaged_customers AS (
        SELECT DISTINCT customer_id
        FROM reviews
        WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
    )
-- High value OR frequent customers
SELECT
    c.customer_id,
    c.customer_name,
    'High Value or Frequent' AS segment
FROM customers c
WHERE c.customer_id IN (
    SELECT customer_id FROM high_value_customers
    UNION
    SELECT customer_id FROM frequent_customers
)

UNION ALL

-- High value AND engaged customers (most valuable)
SELECT
    c.customer_id,
    c.customer_name,
    'VIP (High Value + Engaged)' AS segment
FROM customers c
WHERE c.customer_id IN (
    SELECT customer_id FROM high_value_customers
    INTERSECT
    SELECT customer_id FROM engaged_customers
)
ORDER BY segment, customer_name;
