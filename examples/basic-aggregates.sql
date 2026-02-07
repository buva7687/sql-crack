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



WITH
             -- Monthly revenue metrics
             monthly_revenue AS (
                 SELECT
                     DATE_TRUNC(o.order_date, 'MONTH') AS report_month,
                     SUM(o.total_amount) AS monthly_revenue,
                     COUNT(DISTINCT o.customer_id) AS unique_customers,
                     COUNT(o.order_id) AS total_orders,
                     AVG(o.total_amount) AS avg_order_value
                 FROM orders o
                 WHERE o.order_date >= DATE('2024-01-01')
                     AND o.status != 'cancelled'
                 GROUP BY DATE_TRUNC(o.order_date, 'MONTH')
             ),

             -- Customer segment classification
             customer_segments AS (
                 SELECT
                     customer_id,
                     CASE
                         WHEN total_lifetime_value > 10000 THEN 'Platinum'
                         WHEN total_lifetime_value > 5000 THEN 'Gold'
                         WHEN total_lifetime_value > 1000 THEN 'Silver'
                         ELSE 'Bronze'
                     END AS customer_tier,
                     total_lifetime_value,
                     order_count
                 FROM customer_lifetime_summary
                 WHERE last_order_date >= DATE('2024-01-01')
             ),

             -- Product category performance
             category_performance AS (
                 SELECT
                     pc.category_id,
                     pc.category_name,
                     COUNT(DISTINCT oi.order_id) AS orders_with_category,
                     SUM(oi.quantity) AS units_sold,
                     SUM(oi.quantity * oi.unit_price) AS category_revenue,
                     AVG(oi.unit_price) AS avg_unit_price
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.product_id
                 JOIN product_categories pc ON p.category_id = pc.category_id
                 GROUP BY pc.category_id, pc.category_name
             )

             SELECT
                 -- Order Identifiers
                 o.order_id,
                 o.order_date,

                 -- Customer Information
                 c.customer_id,
                 c.customer_name,
                 c.email AS customer_email,
                 c.city AS customer_city,
                 c.country AS customer_country,
                 cs.customer_tier,

                 -- Order Details
                 o.status AS order_status,
                 o.total_amount AS order_total,
                 o.shipping_amount,
                 o.tax_amount,

                 -- Product Information (aggregated per order)
                 COUNT(DISTINCT oi.product_id) AS unique_products,
                 SUM(oi.quantity) AS total_items,

                 -- Revenue Metrics
                 o.total_amount - (o.cost_of_goods + o.shipping_amount + o.tax_amount) AS profit_margin,

                 -- Time-based Metrics
                 DATEDIFF('day', o.order_date, o.shipment_date) AS fulfillment_days,
                 EXTRACT('hour' FROM o.order_date) AS order_hour,

                 -- Monthly Context
                 mr.monthly_revenue,
                 mr.avg_order_value AS monthly_avg_order_value,

                 -- Customer Behavior
                 cs.order_count AS customer_lifetime_orders,
                 cs.total_lifetime_value AS customer_lifetime_spend,

                 -- Flagging
                 CASE
                     WHEN o.status = 'delivered' AND o.shipment_date > o.estimated_delivery_date THEN 1
                     ELSE 0
                 END AS is_late_delivery,

                 CASE
                     WHEN o.total_amount > (mr.monthly_revenue / mr.total_orders) * 2 THEN 1
                     ELSE 0
                 END AS is_high_value_order

             FROM orders o
             JOIN customers c ON o.customer_id = c.customer_id
             JOIN customer_segments cs ON o.customer_id = cs.customer_id
             JOIN order_items oi ON o.order_id = oi.order_id
             JOIN monthly_revenue mr ON DATE_TRUNC(o.order_date, 'MONTH') = mr.report_month
             LEFT JOIN shipments s ON o.order_id = s.order_id

             WHERE o.order_date >= DATE('2024-01-01')
                 AND o.order_date < DATE('2024-02-01')
                 AND o.status IN ('pending', 'processing', 'shipped', 'delivered')

             GROUP BY
                 o.order_id,
                 o.order_date,
                 c.customer_id,
                 c.customer_name,
                 c.email,
                 c.city,
                 c.country,
                 cs.customer_tier,
                 cs.order_count,
                 cs.total_lifetime_value,
                 o.status,
                 o.total_amount,
                 o.shipping_amount,
                 o.tax_amount,
                 o.cost_of_goods,
                 o.shipment_date,
                 o.estimated_delivery_date,
                 mr.monthly_revenue,
                 mr.avg_order_value

             ORDER BY
                 o.order_date DESC,
                 o.total_amount DESC
             LIMIT 1000;