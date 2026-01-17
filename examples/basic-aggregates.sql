-- ============================================================
-- Aggregate Functions - Comprehensive Examples
-- ============================================================
-- This file demonstrates GROUP BY, HAVING, and aggregate functions
--
-- Features covered:
--   1. Basic aggregate functions (COUNT, SUM, AVG, MIN, MAX)
--   2. GROUP BY with single and multiple columns
--   3. HAVING clause for filtering aggregates
--   4. DISTINCT aggregations
--   5. String aggregation functions
--   6. Conditional aggregation with CASE
--   7. NULL handling in aggregates
--
-- Use these examples to test:
--   - Aggregate node visualization
--   - GROUP BY transformations
--   - HAVING filter visualization
-- ============================================================

-- ============================================================
-- 1. Basic Aggregates with GROUP BY
-- ============================================================
SELECT
    customer_id,
    COUNT(*) AS order_count,
    SUM(total_amount) AS total_spent,
    AVG(total_amount) AS avg_order_value,
    MIN(total_amount) AS smallest_order,
    MAX(total_amount) AS largest_order
FROM orders
WHERE status = 'completed'
GROUP BY customer_id
ORDER BY total_spent DESC;

-- ============================================================
-- 2. Multiple Column GROUP BY
-- ============================================================
SELECT
    region,
    tier,
    COUNT(*) AS customer_count,
    AVG(EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM registration_date)) AS avg_tenure_years
FROM customers
WHERE status = 'active'
GROUP BY region, tier
ORDER BY region, customer_count DESC;

-- ============================================================
-- 3. HAVING Clause (filter aggregated results)
-- ============================================================
SELECT
    category,
    COUNT(*) AS product_count,
    AVG(price) AS avg_price,
    SUM(CASE WHEN active THEN 1 ELSE 0 END) AS active_products
FROM products
GROUP BY category
HAVING COUNT(*) >= 5
    AND AVG(price) > 50
ORDER BY avg_price DESC;

-- ============================================================
-- 4. String Functions with Aggregates
-- ============================================================
SELECT
    customer_id,
    UPPER(customer_name) AS customer_name_upper,
    LOWER(email) AS email_lower,
    COUNT(*) AS order_count,
    SUM(total_amount) AS total_amount
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, customer_name, email
HAVING SUM(total_amount) > 1000
ORDER BY total_amount DESC;

-- ============================================================
-- 5. COUNT DISTINCT (unique values)
-- ============================================================
SELECT
    category,
    COUNT(*) AS total_products,
    COUNT(DISTINCT brand) AS unique_brands,
    COUNT(DISTINCT subcategory) AS unique_subcategories,
    AVG(price) AS avg_price
FROM products
WHERE active = TRUE
GROUP BY category
ORDER BY unique_brands DESC;

-- ============================================================
-- 6. Conditional Aggregation with CASE
-- ============================================================
SELECT
    region,
    COUNT(*) AS total_orders,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
    SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_orders,
    ROUND(
        100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*),
        2
    ) AS completion_rate_pct
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
GROUP BY region
ORDER BY completion_rate_pct DESC;

-- ============================================================
-- 7. Date-based Aggregation
-- ============================================================
SELECT
    DATE_TRUNC('month', order_date) AS month,
    COUNT(*) AS order_count,
    SUM(total_amount) AS monthly_revenue,
    AVG(total_amount) AS avg_order_value,
    COUNT(DISTINCT customer_id) AS unique_customers
FROM orders
WHERE order_date >= '2024-01-01'
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY month;

-- ============================================================
-- 8. Multi-level Aggregation with Subquery
-- ============================================================
SELECT
    category,
    AVG(product_avg_rating) AS category_avg_rating,
    SUM(total_reviews) AS category_total_reviews,
    COUNT(*) AS products_with_reviews
FROM (
    SELECT
        p.category,
        p.product_id,
        AVG(r.rating) AS product_avg_rating,
        COUNT(r.review_id) AS total_reviews
    FROM products p
    JOIN reviews r ON p.product_id = r.product_id
    GROUP BY p.category, p.product_id
    HAVING COUNT(r.review_id) >= 3
) AS product_ratings
GROUP BY category
HAVING AVG(product_avg_rating) >= 3.5
ORDER BY category_avg_rating DESC;

-- ============================================================
-- 9. NULL Handling in Aggregates
-- ============================================================
SELECT
    category,
    COUNT(*) AS total_products,
    COUNT(subcategory) AS products_with_subcategory,
    COUNT(*) - COUNT(subcategory) AS products_without_subcategory,
    COALESCE(AVG(cost), 0) AS avg_cost,
    COALESCE(SUM(cost), 0) AS total_cost
FROM products
GROUP BY category
ORDER BY total_products DESC;

-- ============================================================
-- 10. Percentage and Ratio Calculations
-- ============================================================
SELECT
    tier,
    COUNT(*) AS customer_count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage_of_total,
    SUM(lifetime_value) AS tier_total_value,
    ROUND(AVG(lifetime_value), 2) AS avg_lifetime_value
FROM (
    SELECT
        c.tier,
        c.customer_id,
        COALESCE(SUM(o.total_amount), 0) AS lifetime_value
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    WHERE c.status = 'active'
    GROUP BY c.tier, c.customer_id
) AS customer_values
GROUP BY tier
ORDER BY tier_total_value DESC;
