-- ============================================================
-- Customer Analytics Queries
-- ============================================================
-- This file contains customer-focused analytical queries
-- References tables from: customer-schema.sql, order-schema.sql
-- Dialect: PostgreSQL / Snowflake

-- Query 1: Customer lifetime value by region
WITH customer_ltv AS (
    SELECT 
        c.customer_id,
        c.customer_name,
        c.region,
        c.tier,
        -- Lifetime value calculation
        COALESCE(SUM(o.total_amount), 0) AS lifetime_value,
        COUNT(DISTINCT o.order_id) AS total_orders,
        MIN(o.order_date) AS first_purchase_date,
        MAX(o.order_date) AS last_purchase_date
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    WHERE c.status = 'active'
    GROUP BY c.customer_id, c.customer_name, c.region, c.tier
)
SELECT 
    region,
    tier,
    COUNT(*) AS customer_count,
    SUM(lifetime_value) AS regional_ltv,
    AVG(lifetime_value) AS avg_ltv_per_customer,
    MAX(lifetime_value) AS highest_ltv,
    MIN(lifetime_value) AS lowest_ltv
FROM customer_ltv
GROUP BY region, tier
ORDER BY regional_ltv DESC;

-- Query 2: Customer retention analysis
WITH customer_cohorts AS (
    SELECT 
        c.customer_id,
        DATE_TRUNC('month', c.registration_date) AS cohort_month,
        -- Purchase behavior by month
        DATE_TRUNC('month', o.order_date) AS purchase_month,
        COUNT(DISTINCT o.order_id) AS orders_count
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    WHERE c.registration_date >= '2024-01-01'
    GROUP BY c.customer_id, DATE_TRUNC('month', c.registration_date), DATE_TRUNC('month', o.order_date)
),
retention_matrix AS (
    SELECT 
        cohort_month,
        purchase_month,
        COUNT(DISTINCT customer_id) AS active_customers
    FROM customer_cohorts
    WHERE purchase_month IS NOT NULL
    GROUP BY cohort_month, purchase_month
)
SELECT 
    r1.cohort_month,
    r1.purchase_month,
    r1.active_customers,
    -- Month number for cohort analysis
    EXTRACT(MONTH FROM AGE(r1.purchase_month, r1.cohort_month)) AS month_number,
    -- Retention rate
    ROUND(
        100.0 * r1.active_customers / 
        NULLIF((SELECT COUNT(DISTINCT customer_id) FROM customer_cohorts WHERE cohort_month = r1.cohort_month), 0),
        2
    ) AS retention_rate_pct
FROM retention_matrix r1
ORDER BY r1.cohort_month, r1.purchase_month;

-- Query 3: High-value customer identification
SELECT 
    c.customer_id,
    c.customer_name,
    c.email,
    c.tier,
    c.region,
    -- RFM analysis (Recency, Frequency, Monetary)
    MAX(o.order_date) AS last_purchase_date,
    DATE_DIFF('day', MAX(o.order_date), CURRENT_DATE) AS days_since_last_purchase,
    COUNT(DISTINCT o.order_id) AS purchase_frequency,
    SUM(o.total_amount) AS total_monetary_value,
    AVG(o.total_amount) AS avg_order_value,
    -- Customer segment based on RFM
    CASE 
        WHEN COUNT(DISTINCT o.order_id) > 10 
             AND SUM(o.total_amount) > 10000 
             AND DATE_DIFF('day', MAX(o.order_date), CURRENT_DATE) < 30 THEN 'Champion'
        WHEN COUNT(DISTINCT o.order_id) > 5 
             AND SUM(o.total_amount) > 5000 THEN 'Loyal Customer'
        WHEN COUNT(DISTINCT o.order_id) > 3 THEN 'Regular Customer'
        WHEN DATE_DIFF('day', MAX(o.order_date), CURRENT_DATE) > 180 THEN 'At Risk'
        ELSE 'New/Nurture'
    END AS customer_segment
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE c.status = 'active'
    AND c.registration_date < CURRENT_DATE - INTERVAL '90 days'
GROUP BY c.customer_id, c.customer_name, c.email, c.tier, c.region
HAVING COUNT(DISTINCT o.order_id) > 0
ORDER BY total_monetary_value DESC;

-- Query 4: Customer feedback analysis
WITH customer_nps AS (
    SELECT 
        cf.customer_id,
        AVG(cf.rating) AS avg_rating,
        COUNT(*) AS feedback_count,
        -- NPS calculation
        SUM(CASE WHEN cf.rating >= 4 THEN 1 ELSE 0 END) AS promoters,
        SUM(CASE WHEN cf.rating <= 2 THEN 1 ELSE 0 END) AS detractors
    FROM customer_feedback cf
    WHERE cf.created_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY cf.customer_id
)
SELECT 
    c.region,
    c.tier,
    COUNT(DISTINCT cn.customer_id) AS customers_with_feedback,
    AVG(cn.avg_rating) AS avg_customer_rating,
    AVG(cn.feedback_count) AS avg_feedback_per_customer,
    -- Net Promoter Score
    ROUND(
        100.0 * SUM(cn.promoters - cn.detractors) / NULLIF(SUM(cn.feedback_count), 0),
        2
    ) AS nps_score
FROM customers c
JOIN customer_nps cn ON c.customer_id = cn.customer_id
WHERE c.status = 'active'
GROUP BY c.region, c.tier
ORDER BY nps_score DESC;
