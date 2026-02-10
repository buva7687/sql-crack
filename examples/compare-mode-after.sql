-- ============================================================
-- Compare Mode (After)
-- ============================================================
-- Goal: Optimized version of compare-mode-before.sql.
-- Use with Compare Mode to validate added/removed/changed node highlights.
-- ============================================================

WITH active_customers AS (
    SELECT
        c.customer_id,
        c.region
    FROM customers c
    WHERE c.status = 'active'
),
orders_90d AS (
    SELECT
        o.order_id,
        o.customer_id,
        o.total_amount,
        o.order_date,
        o.sales_rep_id
    FROM orders o
    WHERE o.order_date >= CURRENT_DATE - INTERVAL 90 DAY
),
customer_lifetime AS (
    SELECT
        o.customer_id,
        AVG(o.total_amount) AS lifetime_avg_order,
        MAX(o.total_amount) AS lifetime_max_order,
        MAX(o.order_date) AS latest_order_date
    FROM orders o
    GROUP BY o.customer_id
),
latest_rep AS (
    SELECT
        o.customer_id,
        o.sales_rep_id
    FROM orders o
    INNER JOIN (
        SELECT customer_id, MAX(order_date) AS max_order_date
        FROM orders
        GROUP BY customer_id
    ) x ON x.customer_id = o.customer_id AND x.max_order_date = o.order_date
),
order_metrics AS (
    SELECT
        ac.customer_id,
        ac.region,
        COUNT(o90.order_id) AS order_count,
        SUM(o90.total_amount) AS gross_revenue
    FROM active_customers ac
    LEFT JOIN orders_90d o90 ON o90.customer_id = ac.customer_id
    GROUP BY ac.customer_id, ac.region
)
SELECT
    om.region,
    om.customer_id,
    om.order_count,
    om.gross_revenue,
    cl.lifetime_avg_order,
    cl.lifetime_max_order,
    sr.team_name AS latest_rep_team,
    CASE
        WHEN om.gross_revenue > 10000 THEN 'platinum'
        WHEN om.gross_revenue > 5000 THEN 'gold'
        ELSE 'standard'
    END AS segment
FROM order_metrics om
LEFT JOIN customer_lifetime cl ON cl.customer_id = om.customer_id
LEFT JOIN latest_rep lr ON lr.customer_id = om.customer_id
LEFT JOIN sales_reps sr ON sr.rep_id = lr.sales_rep_id
WHERE om.order_count > 0
ORDER BY om.gross_revenue DESC;
