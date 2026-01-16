-- ============================================================
-- Window Functions - Comprehensive Examples
-- ============================================================
-- This file demonstrates all window function patterns
--
-- Features covered:
--   1. Ranking functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)
--   2. Aggregate window functions (SUM, AVG, COUNT, MIN, MAX)
--   3. Value functions (FIRST_VALUE, LAST_VALUE, NTH_VALUE)
--   4. Offset functions (LAG, LEAD)
--   5. PARTITION BY clause
--   6. ORDER BY within windows
--   7. Frame specifications (ROWS, RANGE)
--   8. Multiple windows in same query
--
-- Use these examples to test:
--   - Window function node visualization
--   - PARTITION BY grouping
--   - Running totals and moving averages
-- ============================================================

-- ============================================================
-- 1. Basic Ranking Functions
-- ============================================================
SELECT
    customer_id,
    order_id,
    total_amount,
    order_date,
    ROW_NUMBER() OVER (ORDER BY total_amount DESC) AS overall_rank,
    RANK() OVER (ORDER BY total_amount DESC) AS rank_with_gaps,
    DENSE_RANK() OVER (ORDER BY total_amount DESC) AS rank_no_gaps,
    NTILE(4) OVER (ORDER BY total_amount DESC) AS quartile
FROM orders
WHERE status = 'completed'
ORDER BY overall_rank;

-- ============================================================
-- 2. PARTITION BY with Ranking
-- ============================================================
SELECT
    customer_id,
    order_id,
    total_amount,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY total_amount DESC) AS customer_order_rank,
    RANK() OVER (PARTITION BY customer_id ORDER BY total_amount DESC) AS customer_amount_rank,
    DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY total_amount DESC) AS dense_rank
FROM orders
WHERE status = 'completed'
ORDER BY customer_id, customer_order_rank;

-- ============================================================
-- 3. Running Totals and Cumulative Sums
-- ============================================================
SELECT
    order_id,
    customer_id,
    order_date,
    total_amount,
    SUM(total_amount) OVER (ORDER BY order_date) AS running_total,
    SUM(total_amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS customer_running_total,
    COUNT(*) OVER (ORDER BY order_date) AS cumulative_order_count
FROM orders
WHERE status = 'completed'
ORDER BY order_date;

-- ============================================================
-- 4. Moving Averages
-- ============================================================
SELECT
    order_date,
    total_amount,
    AVG(total_amount) OVER (
        ORDER BY order_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS moving_avg_7_day,
    AVG(total_amount) OVER (
        ORDER BY order_date
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) AS moving_avg_30_day,
    SUM(total_amount) OVER (
        ORDER BY order_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_sum_7_day
FROM orders
WHERE status = 'completed'
ORDER BY order_date;

-- ============================================================
-- 5. LAG and LEAD (Previous/Next Values)
-- ============================================================
SELECT
    customer_id,
    order_id,
    order_date,
    total_amount,
    LAG(total_amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS prev_order_amount,
    LEAD(total_amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS next_order_amount,
    total_amount - LAG(total_amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS amount_change,
    LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS prev_order_date,
    order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS days_since_last_order
FROM orders
WHERE status = 'completed'
ORDER BY customer_id, order_date;

-- ============================================================
-- 6. FIRST_VALUE and LAST_VALUE
-- ============================================================
SELECT
    customer_id,
    order_id,
    order_date,
    total_amount,
    FIRST_VALUE(total_amount) OVER (
        PARTITION BY customer_id
        ORDER BY order_date
    ) AS first_order_amount,
    LAST_VALUE(total_amount) OVER (
        PARTITION BY customer_id
        ORDER BY order_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS last_order_amount,
    FIRST_VALUE(order_date) OVER (
        PARTITION BY customer_id
        ORDER BY order_date
    ) AS first_order_date
FROM orders
WHERE status = 'completed'
ORDER BY customer_id, order_date;

-- ============================================================
-- 7. Partition-Level Aggregates
-- ============================================================
SELECT
    customer_id,
    order_id,
    total_amount,
    AVG(total_amount) OVER (PARTITION BY customer_id) AS customer_avg_order,
    SUM(total_amount) OVER (PARTITION BY customer_id) AS customer_total_spent,
    COUNT(*) OVER (PARTITION BY customer_id) AS customer_order_count,
    MIN(total_amount) OVER (PARTITION BY customer_id) AS customer_min_order,
    MAX(total_amount) OVER (PARTITION BY customer_id) AS customer_max_order
FROM orders
WHERE status = 'completed'
ORDER BY customer_id, order_id;

-- ============================================================
-- 8. Percentage of Total
-- ============================================================
SELECT
    category,
    product_name,
    price,
    SUM(price) OVER (PARTITION BY category) AS category_total,
    ROUND(100.0 * price / SUM(price) OVER (PARTITION BY category), 2) AS pct_of_category,
    SUM(price) OVER () AS grand_total,
    ROUND(100.0 * price / SUM(price) OVER (), 2) AS pct_of_total
FROM products
WHERE active = TRUE
ORDER BY category, price DESC;

-- ============================================================
-- 9. Complex Window with Multiple Partitions
-- ============================================================
SELECT
    p.category,
    p.product_name,
    p.price,
    RANK() OVER (PARTITION BY p.category ORDER BY p.price DESC) AS category_price_rank,
    AVG(p.price) OVER (PARTITION BY p.category) AS category_avg_price,
    p.price - AVG(p.price) OVER (PARTITION BY p.category) AS price_vs_category_avg,
    RANK() OVER (ORDER BY p.price DESC) AS overall_price_rank,
    PERCENT_RANK() OVER (ORDER BY p.price) AS price_percentile
FROM products p
WHERE p.active = TRUE
ORDER BY p.category, category_price_rank;

-- ============================================================
-- 10. Year-over-Year Comparison
-- ============================================================
WITH monthly_revenue AS (
    SELECT
        DATE_TRUNC('month', order_date) AS month,
        SUM(total_amount) AS revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY DATE_TRUNC('month', order_date)
)
SELECT
    month,
    revenue,
    LAG(revenue, 12) OVER (ORDER BY month) AS revenue_last_year,
    revenue - LAG(revenue, 12) OVER (ORDER BY month) AS yoy_change,
    ROUND(
        100.0 * (revenue - LAG(revenue, 12) OVER (ORDER BY month)) /
        NULLIF(LAG(revenue, 12) OVER (ORDER BY month), 0),
        2
    ) AS yoy_change_pct
FROM monthly_revenue
ORDER BY month;

-- ============================================================
-- 11. Week-over-Week with LAG
-- ============================================================
WITH daily_metrics AS (
    SELECT
        order_date,
        COUNT(*) AS order_count,
        SUM(total_amount) AS daily_revenue,
        COUNT(DISTINCT customer_id) AS unique_customers
    FROM orders
    WHERE status = 'completed'
    GROUP BY order_date
)
SELECT
    order_date,
    order_count,
    daily_revenue,
    unique_customers,
    LAG(daily_revenue, 7) OVER (ORDER BY order_date) AS revenue_7_days_ago,
    daily_revenue - LAG(daily_revenue, 7) OVER (ORDER BY order_date) AS wow_change
FROM daily_metrics
ORDER BY order_date DESC
LIMIT 30;
