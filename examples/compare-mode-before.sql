-- ============================================================
-- Compare Mode (Before)
-- ============================================================
-- Goal: Use this as the baseline snapshot for Compare Mode.
-- Steps:
--   1) Visualize this file.
--   2) Click 📌 to pin it.
--   3) Open compare-mode-after.sql and visualize.
--   4) Click ⇆ Compare.
--
-- Expected in compare view:
--   - Several nodes removed/changed between before/after.
--   - Joins/subqueries/complexity deltas in the compare header.
-- ============================================================

WITH active_customers AS (
    SELECT
        c.customer_id,
        c.region,
        c.signup_date
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
order_metrics AS (
    SELECT
        ac.customer_id,
        ac.region,
        COUNT(o90.order_id) AS order_count,
        SUM(o90.total_amount) AS gross_revenue,
        (SELECT AVG(total_amount) FROM orders ox WHERE ox.customer_id = ac.customer_id) AS lifetime_avg_order,
        (SELECT MAX(total_amount) FROM orders oy WHERE oy.customer_id = ac.customer_id) AS lifetime_max_order
    FROM active_customers ac
    LEFT JOIN orders_90d o90 ON o90.customer_id = ac.customer_id
    GROUP BY ac.customer_id, ac.region
),
rep_enrichment AS (
    SELECT
        om.customer_id,
        om.region,
        om.order_count,
        om.gross_revenue,
        om.lifetime_avg_order,
        om.lifetime_max_order,
        (SELECT sr.team_name FROM sales_reps sr WHERE sr.rep_id = (
            SELECT o.sales_rep_id
            FROM orders o
            WHERE o.customer_id = om.customer_id
            ORDER BY o.order_date DESC
            LIMIT 1
        )) AS latest_rep_team
    FROM order_metrics om
)
SELECT
    re.region,
    re.customer_id,
    re.order_count,
    re.gross_revenue,
    re.lifetime_avg_order,
    re.lifetime_max_order,
    re.latest_rep_team,
    CASE
        WHEN re.gross_revenue > 10000 THEN 'platinum'
        WHEN re.gross_revenue > 5000 THEN 'gold'
        ELSE 'standard'
    END AS segment
FROM rep_enrichment re
WHERE re.order_count > 0
ORDER BY re.gross_revenue DESC;
