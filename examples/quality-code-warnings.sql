-- ============================================================
-- Code Quality Warnings - Unused Resources and Anti-Patterns
-- ============================================================
-- This file demonstrates code quality issues the extension detects
--
-- Quality issues covered:
--   1. Unused CTEs (defined but never referenced)
--   2. Dead columns (selected but never used downstream)
--   3. Duplicate subqueries (same subquery used multiple times)
--   4. Repeated table scans (same table scanned multiple times)
--   5. Query complexity metrics (depth, fan-out, critical path)
--   6. SELECT * usage
--   7. DELETE/UPDATE without WHERE
--   8. Cartesian products
--   9. Excessive JOINs
--
-- Use these examples to test:
--   - Warning badges on nodes
--   - Query complexity panel
--   - Code quality suggestions
-- ============================================================

-- ============================================================
-- 1. Unused CTE Detection
-- ============================================================
-- This query has a CTE that is defined but never used
WITH
    used_cte AS (
        SELECT customer_id, SUM(total_amount) AS total
        FROM orders
        GROUP BY customer_id
    ),
    unused_cte AS (
        -- WARNING: This CTE is defined but never referenced
        SELECT product_id, COUNT(*) AS count
        FROM products
        GROUP BY product_id
    ),
    another_unused AS (
        -- WARNING: Another unused CTE
        SELECT region, COUNT(*) AS customer_count
        FROM customers
        GROUP BY region
    )
SELECT
    c.customer_name,
    uc.total
FROM customers c
JOIN used_cte uc ON c.customer_id = uc.customer_id
ORDER BY uc.total DESC;

-- ============================================================
-- 2. Dead Columns Detection
-- ============================================================
-- This query selects columns that are never used downstream
SELECT
    order_id,           -- Used in WHERE (sort of needed)
    customer_id,        -- Used in output
    order_date,         -- Used in ORDER BY
    total_amount,       -- Used in output
    shipping_address,   -- DEAD COLUMN: Never used
    billing_address,    -- DEAD COLUMN: Never used
    notes,              -- DEAD COLUMN: Never used
    internal_code,      -- DEAD COLUMN: Never used
    tracking_number     -- DEAD COLUMN: Never used
FROM orders
WHERE order_id > 1000
ORDER BY order_date;

-- ============================================================
-- 3. Duplicate Subqueries
-- ============================================================
-- This query has similar subqueries that could be extracted to CTEs
SELECT
    o1.order_id,
    o1.total_amount,
    (SELECT AVG(total_amount) FROM orders WHERE customer_id = o1.customer_id) AS avg_order,
    (SELECT COUNT(*) FROM orders WHERE customer_id = o1.customer_id) AS order_count,
    (SELECT MAX(total_amount) FROM orders WHERE customer_id = o1.customer_id) AS max_order
FROM orders o1
WHERE o1.order_date >= '2024-01-01'
    AND o1.total_amount > (
        -- Duplicate of first subquery!
        SELECT AVG(total_amount) FROM orders WHERE customer_id = o1.customer_id
    );

-- ============================================================
-- 4. Repeated Table Scans
-- ============================================================
-- Same table accessed multiple times with self-joins and subqueries
SELECT
    o1.order_id,
    o1.customer_id,
    o2.total_amount AS previous_order_amount,
    o3.total_amount AS next_order_amount
FROM orders o1
LEFT JOIN orders o2 ON o2.customer_id = o1.customer_id
    AND o2.order_date < o1.order_date
LEFT JOIN orders o3 ON o3.customer_id = o1.customer_id
    AND o3.order_date > o1.order_date
WHERE o1.order_date BETWEEN '2024-01-01' AND '2024-12-31';

-- ============================================================
-- 5. Complex Query with Multiple Issues
-- ============================================================
-- This query demonstrates multiple quality issues at once
WITH
    -- Level 1 CTE
    customer_totals AS (
        SELECT
            customer_id,
            COUNT(*) AS order_count,
            SUM(total_amount) AS total_spent
        FROM orders
        GROUP BY customer_id
    ),
    -- Level 2 CTE (nested dependency)
    customer_stats AS (
        SELECT
            ct.customer_id,
            ct.order_count,
            ct.total_spent,
            AVG(ct.total_spent) OVER () AS avg_total_spent
        FROM customer_totals ct
    ),
    -- Level 3 CTE (deep nesting - tests maxCteDepth)
    enriched_stats AS (
        SELECT
            cs.*,
            CASE
                WHEN cs.total_spent > cs.avg_total_spent THEN 'High Value'
                ELSE 'Standard'
            END AS customer_segment
        FROM customer_stats cs
    ),
    -- UNUSED CTE - should show warning
    unused_analysis AS (
        SELECT
            product_id,
            SUM(quantity) AS total_quantity
        FROM order_items
        GROUP BY product_id
    ),
    -- Another CTE that scans orders again (repeated scan)
    recent_orders AS (
        SELECT
            order_id,
            customer_id,
            order_date,
            total_amount
        FROM orders
        WHERE order_date >= '2024-01-01'
    )
SELECT
    c.customer_name,
    es.order_count,
    es.total_spent,
    es.customer_segment,
    ro.order_id,
    ro.order_date,
    ro.total_amount,
    c.email,               -- DEAD COLUMN
    c.phone,               -- DEAD COLUMN
    c.shipping_address,    -- DEAD COLUMN
    COUNT(ro.order_id) OVER (PARTITION BY es.customer_id) AS customer_order_count
FROM customers c
JOIN enriched_stats es ON c.customer_id = es.customer_id
JOIN recent_orders ro ON c.customer_id = ro.customer_id
LEFT JOIN products p ON ro.order_id = p.product_id  -- Suspicious join condition
WHERE es.total_spent > 1000
ORDER BY es.total_spent DESC
LIMIT 100;

-- ============================================================
-- 6. Duplicate Subqueries in WHERE and SELECT
-- ============================================================
SELECT
    o.order_id,
    o.customer_id,
    o.total_amount,
    (SELECT customer_name FROM customers WHERE customer_id = o.customer_id) AS customer_name,
    (SELECT COUNT(*) FROM orders WHERE customer_id = o.customer_id) AS order_count
FROM orders o
WHERE o.total_amount > (
    -- Duplicate pattern
    SELECT AVG(total_amount) FROM orders WHERE customer_id = o.customer_id
)
AND o.order_date >= (
    -- Another subquery on same table
    SELECT MIN(order_date) FROM orders WHERE customer_id = o.customer_id
);

-- ============================================================
-- 7. High Complexity Query
-- ============================================================
-- Tests: High fan-out, long critical path, complexity breakdown
WITH
    level1 AS (
        SELECT customer_id, SUM(total_amount) AS total
        FROM orders
        GROUP BY customer_id
    ),
    level2 AS (
        SELECT
            l1.customer_id,
            l1.total,
            (SELECT COUNT(*) FROM orders WHERE customer_id = l1.customer_id) AS order_count
        FROM level1 l1
    ),
    level3 AS (
        SELECT
            l2.*,
            CASE
                WHEN l2.total > 10000 THEN 'Premium'
                WHEN l2.total > 5000 THEN 'Gold'
                ELSE 'Standard'
            END AS tier
        FROM level2 l2
    )
SELECT
    c.customer_name,
    l3.total,
    l3.order_count,
    l3.tier,
    p.product_name,
    cat.category_name,
    s.supplier_name
FROM level3 l3
JOIN customers c ON c.customer_id = l3.customer_id
JOIN orders o ON o.customer_id = l3.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id
JOIN categories cat ON cat.category_id = p.category_id
LEFT JOIN suppliers s ON s.supplier_id = p.supplier_id
WHERE l3.total > 1000
ORDER BY l3.total DESC;

-- ============================================================
-- 8. SELECT * Anti-Pattern
-- ============================================================
-- Retrieves all columns, including unnecessary ones
SELECT * FROM customers WHERE status = 'active';

SELECT * FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= '2024-01-01';

-- ============================================================
-- 9. DELETE without WHERE (DANGEROUS!)
-- ============================================================
-- This will delete ALL rows - should show critical warning
DELETE FROM temp_logs;

DELETE FROM audit_trail;

-- ============================================================
-- 10. UPDATE without WHERE (DANGEROUS!)
-- ============================================================
-- This will update ALL rows - should show critical warning
UPDATE products SET discount_percent = 0;

UPDATE customers SET last_login_date = CURRENT_TIMESTAMP;

-- ============================================================
-- 11. Cartesian Product (Unintentional CROSS JOIN)
-- ============================================================
-- Missing JOIN condition creates Cartesian product
SELECT
    c.customer_name,
    p.product_name,
    o.total_amount
FROM customers c, products p, orders o
WHERE c.customer_id = o.customer_id;
-- Missing: AND p.product_id = ... (creates Cartesian with products)

-- ============================================================
-- 12. Excessive JOINs (7+ tables)
-- ============================================================
SELECT
    c.customer_name,
    o.order_id,
    oi.quantity,
    p.product_name,
    cat.category_name,
    s.supplier_name,
    w.warehouse_name,
    sh.shipper_name,
    r.region_name
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id
JOIN categories cat ON cat.category_id = p.category_id
JOIN suppliers s ON s.supplier_id = p.supplier_id
JOIN warehouses w ON w.warehouse_id = oi.warehouse_id
JOIN shippers sh ON sh.shipper_id = o.shipper_id
JOIN regions r ON r.region_id = c.region_id
WHERE o.status = 'completed';

-- ============================================================
-- 13. HAVING without Aggregate (Should be WHERE)
-- ============================================================
SELECT
    category,
    COUNT(*) AS product_count
FROM products
GROUP BY category
HAVING category = 'Electronics';  -- This should be in WHERE clause!

-- ============================================================
-- 14. NULL in NOT IN (Unexpected Behavior)
-- ============================================================
-- If subquery returns any NULL, entire NOT IN returns no rows
SELECT customer_name
FROM customers
WHERE customer_id NOT IN (
    SELECT customer_id FROM orders  -- If any customer_id is NULL, this fails!
);
