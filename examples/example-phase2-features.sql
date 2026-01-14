-- ============================================================
-- SQL Crack Phase 2 Features Test File
-- ============================================================
-- This file demonstrates all Phase 2: Developer Productivity & Quality features
-- including Advanced SQL Annotations and Query Complexity Insights
--
-- Features to test:
-- 1. Unused CTEs (warning badge on unused CTE)
-- 2. Dead columns (warning badge on SELECT with unused columns)
-- 3. Duplicate subqueries (warning badge on duplicate subqueries)
-- 4. Repeated table scans (warning badge on tables scanned multiple times)
-- 5. Query complexity insights (CTE depth, fan-out, critical path, breakdown)
-- ============================================================

-- Example 1: Unused CTE Detection
-- This query has a CTE that is defined but never used
WITH 
    used_cte AS (
        SELECT customer_id, SUM(amount) as total
        FROM orders
        GROUP BY customer_id
    ),
    unused_cte AS (
        -- This CTE is defined but never referenced - should show warning badge
        SELECT product_id, COUNT(*) as count
        FROM products
        GROUP BY product_id
    )
SELECT 
    c.customer_name,
    uc.total
FROM customers c
JOIN used_cte uc ON c.customer_id = uc.customer_id;

-- Example 2: Dead Columns Detection
-- This query selects columns that are never used downstream
SELECT 
    order_id,           -- Used in WHERE
    customer_id,        -- Used in JOIN
    order_date,         -- Used in ORDER BY
    total_amount,        -- Used in SELECT output
    shipping_address,   -- DEAD COLUMN: Never used - should show warning badge
    billing_address,    -- DEAD COLUMN: Never used - should show warning badge
    notes               -- DEAD COLUMN: Never used - should show warning badge
FROM orders
WHERE order_id > 1000
ORDER BY order_date;

-- Example 3: Duplicate Subqueries
-- This query has similar subqueries that could be extracted to CTEs
SELECT 
    o1.order_id,
    o1.total_amount,
    (SELECT AVG(total_amount) FROM orders WHERE customer_id = o1.customer_id) as avg_customer_order,
    (SELECT COUNT(*) FROM orders WHERE customer_id = o1.customer_id) as customer_order_count
FROM orders o1
WHERE o1.order_date >= '2024-01-01'
  AND o1.total_amount > (
      -- Duplicate subquery pattern - should show warning badge
      SELECT AVG(total_amount) FROM orders WHERE customer_id = o1.customer_id
  );

-- Example 4: Repeated Table Scans
-- This query scans the same table multiple times - should show warning badges
SELECT 
    o1.order_id,
    o1.customer_id,
    o2.total_amount as previous_order_amount,
    o3.total_amount as next_order_amount
FROM orders o1
LEFT JOIN orders o2 ON o2.customer_id = o1.customer_id 
    AND o2.order_date < o1.order_date
LEFT JOIN orders o3 ON o3.customer_id = o1.customer_id 
    AND o3.order_date > o1.order_date
WHERE o1.order_date BETWEEN '2024-01-01' AND '2024-12-31';

-- Example 5: Complex Query with All Features
-- This query demonstrates multiple complexity features:
-- - Deep CTE nesting (maxCteDepth)
-- - High fan-out (multiple JOINs from same node)
-- - Long critical path
-- - Complexity breakdown
WITH 
    -- Level 1 CTE
    customer_totals AS (
        SELECT 
            customer_id,
            COUNT(*) as order_count,
            SUM(total_amount) as total_spent
        FROM orders
        GROUP BY customer_id
    ),
    -- Level 2 CTE (nested)
    customer_stats AS (
        SELECT 
            ct.customer_id,
            ct.order_count,
            ct.total_spent,
            AVG(ct.total_spent) OVER () as avg_total_spent
        FROM customer_totals ct
    ),
    -- Level 3 CTE (deep nesting - tests maxCteDepth)
    enriched_stats AS (
        SELECT 
            cs.*,
            CASE 
                WHEN cs.total_spent > cs.avg_total_spent THEN 'High Value'
                ELSE 'Standard'
            END as customer_segment
        FROM customer_stats cs
    ),
    -- Unused CTE - should show warning badge
    unused_analysis AS (
        SELECT 
            product_id,
            SUM(quantity) as total_quantity
        FROM order_items
        GROUP BY product_id
    ),
    -- Repeated table scan - orders table used again
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
    ro.order_id,           -- Used
    ro.order_date,         -- Used
    ro.total_amount,       -- Used
    c.email,               -- DEAD COLUMN: Never used - should show warning badge
    c.phone,               -- DEAD COLUMN: Never used - should show warning badge
    COUNT(ro.order_id) OVER (PARTITION BY es.customer_id) as customer_order_count,
    SUM(ro.total_amount) OVER (PARTITION BY es.customer_id) as customer_total
FROM customers c
JOIN enriched_stats es ON c.customer_id = es.customer_id
JOIN recent_orders ro ON c.customer_id = ro.customer_id
LEFT JOIN products p ON ro.order_id = p.product_id  -- High fan-out from recent_orders
LEFT JOIN categories cat ON p.category_id = cat.category_id
WHERE es.total_spent > 1000
  AND ro.order_date >= '2024-01-01'
GROUP BY 
    c.customer_name,
    es.order_count,
    es.total_spent,
    es.customer_segment,
    ro.order_id,
    ro.order_date,
    ro.total_amount,
    c.email,
    c.phone
HAVING COUNT(ro.order_id) > 1
ORDER BY es.total_spent DESC
LIMIT 100;

-- Example 6: Duplicate Subqueries in WHERE and SELECT
-- Should show warning badges on both duplicate subqueries
SELECT 
    o.order_id,
    o.customer_id,
    o.total_amount,
    (SELECT customer_name FROM customers WHERE customer_id = o.customer_id) as customer_name,
    (SELECT COUNT(*) FROM orders WHERE customer_id = o.customer_id) as customer_order_count
FROM orders o
WHERE o.total_amount > (
    SELECT AVG(total_amount) FROM orders WHERE customer_id = o.customer_id
)
  AND o.order_date >= (
      SELECT MIN(order_date) FROM orders WHERE customer_id = o.customer_id
  );

-- Example 7: Multiple Repeated Scans with Different Patterns
-- Should show warning badges on all instances of repeated table scans
SELECT 
    o1.order_id,
    o1.customer_id,
    o2.order_id as previous_order_id,
    o3.order_id as next_order_id,
    o4.total_amount as customer_avg_order
FROM orders o1
LEFT JOIN orders o2 ON o2.customer_id = o1.customer_id 
    AND o2.order_date = (
        SELECT MAX(order_date) 
        FROM orders 
        WHERE customer_id = o1.customer_id 
          AND order_date < o1.order_date
    )
LEFT JOIN orders o3 ON o3.customer_id = o1.customer_id 
    AND o3.order_date = (
        SELECT MIN(order_date) 
        FROM orders 
        WHERE customer_id = o1.customer_id 
          AND order_date > o1.order_date
    )
LEFT JOIN (
    SELECT customer_id, AVG(total_amount) as total_amount
    FROM orders
    GROUP BY customer_id
) o4 ON o4.customer_id = o1.customer_id
WHERE o1.order_date >= '2024-01-01';

-- Example 8: High Complexity Query
-- Tests: High fan-out, long critical path, complexity breakdown
WITH 
    level1 AS (
        SELECT customer_id, SUM(total_amount) as total
        FROM orders
        GROUP BY customer_id
    ),
    level2 AS (
        SELECT 
            l1.customer_id,
            l1.total,
            (SELECT COUNT(*) FROM orders WHERE customer_id = l1.customer_id) as order_count
        FROM level1 l1
    ),
    level3 AS (
        SELECT 
            l2.*,
            CASE 
                WHEN l2.total > 10000 THEN 'Premium'
                WHEN l2.total > 5000 THEN 'Gold'
                ELSE 'Standard'
            END as tier
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
GROUP BY 
    c.customer_name,
    l3.total,
    l3.order_count,
    l3.tier,
    p.product_name,
    cat.category_name,
    s.supplier_name
ORDER BY l3.total DESC;

