-- Performance Benchmark: Large Query
-- Expected: ~150-200+ nodes
-- Tests multiple CTEs, window functions, nested subqueries, CASE statements

WITH
-- CTE 1: Base user data with activity metrics
user_activity AS (
    SELECT
        u.id AS user_id,
        u.name,
        u.email,
        u.signup_date,
        u.region,
        u.country,
        COUNT(DISTINCT s.session_id) AS total_sessions,
        SUM(s.duration_seconds) AS total_time_spent,
        MAX(s.created_at) AS last_active,
        MIN(s.created_at) AS first_active
    FROM users u
    LEFT JOIN sessions s ON u.id = s.user_id
    WHERE u.status = 'active'
    GROUP BY u.id, u.name, u.email, u.signup_date, u.region, u.country
),

-- CTE 2: Order history aggregation
order_history AS (
    SELECT
        o.user_id,
        COUNT(*) AS order_count,
        SUM(o.total_amount) AS total_spent,
        AVG(o.total_amount) AS avg_order_value,
        MIN(o.order_date) AS first_order,
        MAX(o.order_date) AS last_order,
        SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END) AS refunded_orders
    FROM orders o
    GROUP BY o.user_id
),

-- CTE 3: Product preferences
product_preferences AS (
    SELECT
        o.user_id,
        p.category,
        COUNT(*) AS purchase_count,
        SUM(oi.quantity * oi.unit_price) AS category_spend
    FROM orders o
    JOIN order_items oi ON o.order_id = oi.order_id
    JOIN products p ON oi.product_id = p.id
    WHERE o.status = 'completed'
    GROUP BY o.user_id, p.category
),

-- CTE 4: Top category per user
top_category AS (
    SELECT
        user_id,
        category AS favorite_category,
        category_spend,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY category_spend DESC) AS rn
    FROM product_preferences
),

-- CTE 5: Customer segmentation
customer_segments AS (
    SELECT
        ua.user_id,
        ua.name,
        oh.total_spent,
        oh.order_count,
        CASE
            WHEN oh.total_spent > 50000 THEN 'Whale'
            WHEN oh.total_spent > 20000 THEN 'VIP'
            WHEN oh.total_spent > 10000 THEN 'Premium'
            WHEN oh.total_spent > 5000 THEN 'Regular'
            WHEN oh.total_spent > 1000 THEN 'Casual'
            ELSE 'New'
        END AS spending_segment,
        CASE
            WHEN oh.order_count > 50 THEN 'Power Buyer'
            WHEN oh.order_count > 20 THEN 'Frequent'
            WHEN oh.order_count > 10 THEN 'Regular'
            WHEN oh.order_count > 5 THEN 'Occasional'
            ELSE 'Rare'
        END AS frequency_segment,
        CASE
            WHEN ua.last_active > DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) THEN 'Active'
            WHEN ua.last_active > DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY) THEN 'Cooling'
            WHEN ua.last_active > DATE_SUB(CURRENT_DATE, INTERVAL 180 DAY) THEN 'At Risk'
            ELSE 'Churned'
        END AS engagement_segment
    FROM user_activity ua
    LEFT JOIN order_history oh ON ua.user_id = oh.user_id
),

-- CTE 6: Regional performance
regional_stats AS (
    SELECT
        ua.region,
        ua.country,
        COUNT(DISTINCT ua.user_id) AS user_count,
        SUM(oh.total_spent) AS regional_revenue,
        AVG(oh.avg_order_value) AS avg_order_value,
        SUM(oh.order_count) AS total_orders
    FROM user_activity ua
    LEFT JOIN order_history oh ON ua.user_id = oh.user_id
    GROUP BY ua.region, ua.country
),

-- CTE 7: Time-based cohort analysis
cohort_analysis AS (
    SELECT
        DATE_TRUNC('month', ua.signup_date) AS cohort_month,
        DATE_TRUNC('month', oh.first_order) AS first_order_month,
        COUNT(DISTINCT ua.user_id) AS cohort_size,
        SUM(oh.total_spent) AS cohort_revenue,
        AVG(EXTRACT(DAY FROM oh.first_order - ua.signup_date)) AS avg_days_to_first_order
    FROM user_activity ua
    LEFT JOIN order_history oh ON ua.user_id = oh.user_id
    WHERE oh.first_order IS NOT NULL
    GROUP BY DATE_TRUNC('month', ua.signup_date), DATE_TRUNC('month', oh.first_order)
),

-- CTE 8: Product analytics
product_analytics AS (
    SELECT
        p.id AS product_id,
        p.product_name,
        p.category,
        p.brand,
        COUNT(DISTINCT oi.order_id) AS times_ordered,
        SUM(oi.quantity) AS units_sold,
        SUM(oi.quantity * oi.unit_price) AS total_revenue,
        AVG(oi.unit_price) AS avg_selling_price,
        COUNT(DISTINCT o.user_id) AS unique_buyers,
        SUM(oi.quantity * oi.unit_price) / NULLIF(COUNT(DISTINCT o.user_id), 0) AS revenue_per_buyer
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.order_id AND o.status = 'completed'
    GROUP BY p.id, p.product_name, p.category, p.brand
),

-- CTE 9: Product rankings
product_rankings AS (
    SELECT
        *,
        ROW_NUMBER() OVER (ORDER BY total_revenue DESC) AS revenue_rank,
        ROW_NUMBER() OVER (ORDER BY units_sold DESC) AS volume_rank,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY total_revenue DESC) AS category_revenue_rank,
        PERCENT_RANK() OVER (ORDER BY total_revenue) AS revenue_percentile,
        NTILE(10) OVER (ORDER BY total_revenue DESC) AS revenue_decile
    FROM product_analytics
    WHERE total_revenue > 0
),

-- CTE 10: Cross-sell analysis
cross_sell AS (
    SELECT
        oi1.product_id AS product_a,
        oi2.product_id AS product_b,
        COUNT(DISTINCT oi1.order_id) AS co_occurrence,
        COUNT(DISTINCT oi1.order_id) * 1.0 /
            (SELECT COUNT(DISTINCT order_id) FROM order_items WHERE product_id = oi1.product_id) AS confidence
    FROM order_items oi1
    JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id < oi2.product_id
    GROUP BY oi1.product_id, oi2.product_id
    HAVING COUNT(DISTINCT oi1.order_id) > 10
)

-- Final SELECT combining all CTEs
SELECT
    cs.user_id,
    cs.name,
    cs.spending_segment,
    cs.frequency_segment,
    cs.engagement_segment,
    tc.favorite_category,
    oh.total_spent,
    oh.order_count,
    oh.avg_order_value,
    oh.completed_orders,
    oh.cancelled_orders,
    ua.total_sessions,
    ua.total_time_spent,
    ua.region,
    ua.country,
    rs.regional_revenue,
    rs.user_count AS region_user_count,
    ca.cohort_size,
    ca.avg_days_to_first_order,
    (
        SELECT pr.product_name
        FROM product_rankings pr
        WHERE pr.category = tc.favorite_category
          AND pr.category_revenue_rank = 1
    ) AS top_product_in_favorite_category,
    (
        SELECT COUNT(*)
        FROM cross_sell xs
        JOIN order_items oi ON xs.product_a = oi.product_id
        JOIN orders o ON oi.order_id = o.order_id
        WHERE o.user_id = cs.user_id
    ) AS cross_sell_opportunities,
    CASE
        WHEN cs.spending_segment IN ('Whale', 'VIP') AND cs.engagement_segment = 'Active' THEN 'Retain'
        WHEN cs.spending_segment IN ('Whale', 'VIP') AND cs.engagement_segment IN ('Cooling', 'At Risk') THEN 'Win Back Priority'
        WHEN cs.spending_segment IN ('Premium', 'Regular') AND cs.engagement_segment = 'Active' THEN 'Upsell'
        WHEN cs.engagement_segment = 'Churned' THEN 'Re-engage'
        ELSE 'Monitor'
    END AS recommended_action
FROM customer_segments cs
LEFT JOIN order_history oh ON cs.user_id = oh.user_id
LEFT JOIN user_activity ua ON cs.user_id = ua.user_id
LEFT JOIN top_category tc ON cs.user_id = tc.user_id AND tc.rn = 1
LEFT JOIN regional_stats rs ON ua.region = rs.region AND ua.country = rs.country
LEFT JOIN cohort_analysis ca ON DATE_TRUNC('month', ua.signup_date) = ca.cohort_month
WHERE cs.spending_segment != 'New'
  AND oh.total_spent > 0
ORDER BY oh.total_spent DESC, cs.name
LIMIT 1000;
