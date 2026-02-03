-- Performance Benchmark: Medium Query
-- Expected: ~50-80 nodes
-- Tests CTEs, subqueries, window functions, aggregations

WITH monthly_revenue AS (
    SELECT
        DATE_TRUNC('month', order_date) AS month,
        SUM(total_amount) AS revenue,
        COUNT(DISTINCT user_id) AS unique_customers,
        COUNT(*) AS order_count
    FROM orders
    WHERE status = 'completed'
    GROUP BY DATE_TRUNC('month', order_date)
),

customer_segments AS (
    SELECT
        u.id AS user_id,
        u.name,
        u.signup_date,
        COUNT(o.order_id) AS total_orders,
        SUM(o.total_amount) AS lifetime_value,
        CASE
            WHEN SUM(o.total_amount) > 10000 THEN 'VIP'
            WHEN SUM(o.total_amount) > 5000 THEN 'Premium'
            WHEN SUM(o.total_amount) > 1000 THEN 'Regular'
            ELSE 'New'
        END AS segment
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'completed'
    GROUP BY u.id, u.name, u.signup_date
),

product_performance AS (
    SELECT
        p.id AS product_id,
        p.product_name,
        p.category,
        SUM(oi.quantity) AS units_sold,
        SUM(oi.quantity * oi.unit_price) AS total_revenue,
        AVG(oi.unit_price) AS avg_price,
        COUNT(DISTINCT o.user_id) AS unique_buyers
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.order_id
    WHERE o.status = 'completed' OR o.status IS NULL
    GROUP BY p.id, p.product_name, p.category
),

ranked_products AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY total_revenue DESC) AS category_rank,
        RANK() OVER (ORDER BY total_revenue DESC) AS overall_rank
    FROM product_performance
)

SELECT
    mr.month,
    mr.revenue,
    mr.unique_customers,
    mr.order_count,
    cs.segment,
    COUNT(DISTINCT cs.user_id) AS segment_customers,
    rp.product_name AS top_product,
    rp.total_revenue AS top_product_revenue
FROM monthly_revenue mr
CROSS JOIN (SELECT DISTINCT segment FROM customer_segments) cs
LEFT JOIN customer_segments cs_detail ON cs.segment = cs_detail.segment
LEFT JOIN ranked_products rp ON rp.overall_rank = 1
GROUP BY mr.month, mr.revenue, mr.unique_customers, mr.order_count,
         cs.segment, rp.product_name, rp.total_revenue
ORDER BY mr.month DESC, cs.segment;
