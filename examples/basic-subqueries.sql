-- ============================================================
-- Subqueries - Comprehensive Examples
-- ============================================================
-- This file demonstrates all subquery patterns for visualization
--
-- Features covered:
--   1. Scalar subqueries (single value in SELECT)
--   2. IN subqueries (list matching)
--   3. EXISTS subqueries (existence check)
--   4. Correlated subqueries
--   5. Subqueries in FROM clause (derived tables)
--   6. Subqueries in WHERE clause
--   7. Nested subqueries (multiple levels)
--   8. NOT IN and NOT EXISTS
--
-- Use these examples to test:
--   - Subquery cloud visualization
--   - Correlated vs non-correlated detection
--   - Subquery expansion
-- ============================================================

-- ============================================================
-- 1. Scalar Subquery in SELECT
-- ============================================================
SELECT
    c.customer_id,
    c.customer_name,
    c.email,
    (SELECT COUNT(*) FROM orders WHERE customer_id = c.customer_id) AS total_orders,
    (SELECT MAX(total_amount) FROM orders WHERE customer_id = c.customer_id) AS largest_order,
    (SELECT AVG(total_amount) FROM orders WHERE customer_id = c.customer_id) AS avg_order_value
FROM customers c
WHERE c.status = 'active'
ORDER BY total_orders DESC;

-- ============================================================
-- 2. IN Subquery (Non-correlated)
-- ============================================================
SELECT
    e.employee_id,
    e.name,
    e.salary
FROM employees e
WHERE e.dept_id IN (
    SELECT id
    FROM departments
    WHERE location = 'New York'
);

-- ============================================================
-- 3. IN Subquery with Aggregation
-- ============================================================
SELECT
    c.customer_name,
    c.email,
    c.tier
FROM customers c
WHERE c.customer_id IN (
    SELECT customer_id
    FROM orders
    WHERE status = 'completed'
    GROUP BY customer_id
    HAVING SUM(total_amount) > 10000
)
ORDER BY c.tier;

-- ============================================================
-- 4. EXISTS Subquery
-- ============================================================
SELECT
    c.customer_name,
    c.email
FROM customers c
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.customer_id = c.customer_id
        AND o.status = 'completed'
        AND o.order_date >= CURRENT_DATE - INTERVAL '30 days'
);

-- ============================================================
-- 5. NOT EXISTS (Find customers without orders)
-- ============================================================
SELECT
    c.customer_id,
    c.customer_name,
    c.email,
    c.registration_date
FROM customers c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.customer_id = c.customer_id
)
ORDER BY c.registration_date DESC;

-- ============================================================
-- 6. NOT IN (with NULL handling warning)
-- ============================================================
-- Note: NOT IN can have unexpected behavior with NULLs
SELECT
    p.product_name,
    p.category,
    p.price
FROM products p
WHERE p.product_id NOT IN (
    SELECT DISTINCT product_id
    FROM order_items
    WHERE order_id IN (
        SELECT order_id
        FROM orders
        WHERE order_date >= '2024-01-01'
    )
);

-- ============================================================
-- 7. Correlated Subquery (references outer query)
-- ============================================================
SELECT
    o.order_id,
    o.customer_id,
    o.total_amount,
    o.order_date,
    (SELECT AVG(total_amount)
     FROM orders
     WHERE customer_id = o.customer_id) AS customer_avg_order,
    o.total_amount - (
        SELECT AVG(total_amount)
        FROM orders
        WHERE customer_id = o.customer_id
    ) AS diff_from_avg
FROM orders o
WHERE o.status = 'completed'
ORDER BY diff_from_avg DESC;

-- ============================================================
-- 8. Subquery in FROM (Derived Table)
-- ============================================================
SELECT
    customer_segment,
    COUNT(*) AS customer_count,
    AVG(total_spent) AS avg_spent,
    SUM(total_spent) AS segment_revenue
FROM (
    SELECT
        c.customer_id,
        c.customer_name,
        COALESCE(SUM(o.total_amount), 0) AS total_spent,
        CASE
            WHEN COALESCE(SUM(o.total_amount), 0) > 10000 THEN 'VIP'
            WHEN COALESCE(SUM(o.total_amount), 0) > 5000 THEN 'Gold'
            WHEN COALESCE(SUM(o.total_amount), 0) > 1000 THEN 'Silver'
            ELSE 'Bronze'
        END AS customer_segment
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
        AND o.status = 'completed'
    GROUP BY c.customer_id, c.customer_name
) AS customer_segments
GROUP BY customer_segment
ORDER BY avg_spent DESC;

-- ============================================================
-- 9. Nested Subqueries (Multiple Levels)
-- ============================================================
SELECT
    p.product_name,
    p.category,
    p.price
FROM products p
WHERE p.category IN (
    SELECT category
    FROM products
    WHERE product_id IN (
        SELECT product_id
        FROM order_items
        WHERE order_id IN (
            SELECT order_id
            FROM orders
            WHERE total_amount > 500
        )
    )
    GROUP BY category
    HAVING COUNT(*) > 5
);

-- ============================================================
-- 10. Subquery with Comparison Operators
-- ============================================================
SELECT
    e.name,
    e.salary,
    e.dept_id
FROM employees e
WHERE e.salary > (
    SELECT AVG(salary)
    FROM employees
    WHERE dept_id = e.dept_id
)
ORDER BY e.salary DESC;

-- ============================================================
-- 11. ALL/ANY with Subquery
-- ============================================================
-- Find products more expensive than ALL products in 'Basic' category
SELECT
    product_name,
    category,
    price
FROM products
WHERE price > ALL (
    SELECT price
    FROM products
    WHERE category = 'Basic'
);

-- Find products with price matching ANY product in 'Premium' category
SELECT
    product_name,
    category,
    price
FROM products
WHERE price = ANY (
    SELECT price
    FROM products
    WHERE category = 'Premium'
)
AND category != 'Premium';

-- ============================================================
-- 12. Complex Multi-Subquery Example
-- ============================================================
SELECT
    c.customer_name,
    c.tier,
    (SELECT COUNT(*) FROM orders WHERE customer_id = c.customer_id) AS order_count,
    (SELECT SUM(total_amount) FROM orders WHERE customer_id = c.customer_id) AS total_spent,
    (SELECT MAX(order_date) FROM orders WHERE customer_id = c.customer_id) AS last_order_date
FROM customers c
WHERE c.customer_id IN (
    SELECT customer_id
    FROM orders
    GROUP BY customer_id
    HAVING COUNT(*) >= 5
)
AND EXISTS (
    SELECT 1
    FROM reviews r
    WHERE r.customer_id = c.customer_id
        AND r.rating >= 4
)
ORDER BY total_spent DESC;
