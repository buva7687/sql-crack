-- ============================================================
-- Data Pipeline - Multi-Stage Lineage Example
-- ============================================================
-- This file demonstrates a complete data pipeline with VIEWs
-- Perfect for testing workspace-level lineage and impact analysis
--
-- Pipeline stages:
--   1. Raw data (source tables)
--   2. Cleaned/transformed data (views)
--   3. Aggregated metrics (views)
--   4. Analytics/reporting (views)
--   5. Executive dashboards (views)
--
-- Use these examples to test:
--   - Workspace lineage graph
--   - Upstream/Downstream tracing
--   - Impact analysis for schema changes
-- ============================================================

-- ============================================================
-- STAGE 1: Raw Source Tables
-- ============================================================
-- These are the base tables that feed the pipeline

CREATE TABLE raw_transactions (
    transaction_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    transaction_date TIMESTAMP NOT NULL,
    payment_method VARCHAR(50),
    status VARCHAR(30) DEFAULT 'pending',
    region VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw_customers (
    customer_id INTEGER PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    registration_date DATE,
    tier VARCHAR(20),
    region VARCHAR(50)
);

CREATE TABLE raw_products (
    product_id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    base_price DECIMAL(10, 2),
    cost DECIMAL(10, 2)
);

-- ============================================================
-- STAGE 2: Cleaned/Transformed Data
-- ============================================================
-- First transformation layer - data cleaning and enrichment

CREATE VIEW cleaned_transactions AS
SELECT
    t.transaction_id,
    t.customer_id,
    t.product_id,
    t.quantity,
    t.unit_price,
    COALESCE(t.discount_amount, 0) AS discount_amount,
    t.quantity * t.unit_price AS gross_amount,
    t.quantity * t.unit_price - COALESCE(t.discount_amount, 0) AS net_amount,
    t.transaction_date,
    DATE(t.transaction_date) AS transaction_date_only,
    EXTRACT(YEAR FROM t.transaction_date) AS year,
    EXTRACT(MONTH FROM t.transaction_date) AS month,
    EXTRACT(DOW FROM t.transaction_date) AS day_of_week,
    t.payment_method,
    COALESCE(t.region, c.region, 'Unknown') AS region,
    t.status,
    CASE
        WHEN t.status = 'completed' THEN TRUE
        ELSE FALSE
    END AS is_completed
FROM raw_transactions t
LEFT JOIN raw_customers c ON t.customer_id = c.customer_id
WHERE t.status != 'cancelled';

CREATE VIEW enriched_products AS
SELECT
    p.product_id,
    p.name AS product_name,
    p.category,
    COALESCE(p.subcategory, p.category) AS subcategory,
    p.base_price,
    p.cost,
    CASE
        WHEN p.cost IS NOT NULL AND p.base_price > 0
        THEN ROUND((p.base_price - p.cost) / p.base_price * 100, 2)
        ELSE NULL
    END AS margin_percent,
    CASE
        WHEN p.base_price >= 100 THEN 'Premium'
        WHEN p.base_price >= 50 THEN 'Mid-Range'
        ELSE 'Budget'
    END AS price_tier
FROM raw_products p;

-- ============================================================
-- STAGE 3: Aggregated Metrics
-- ============================================================
-- Second transformation layer - aggregations

CREATE VIEW daily_sales AS
SELECT
    transaction_date_only AS report_date,
    region,
    COUNT(*) AS transaction_count,
    COUNT(DISTINCT customer_id) AS unique_customers,
    SUM(gross_amount) AS gross_revenue,
    SUM(net_amount) AS net_revenue,
    SUM(discount_amount) AS total_discounts,
    AVG(net_amount) AS avg_transaction_value,
    SUM(quantity) AS total_items_sold
FROM cleaned_transactions
WHERE is_completed = TRUE
GROUP BY transaction_date_only, region;

CREATE VIEW customer_metrics AS
SELECT
    ct.customer_id,
    rc.name AS customer_name,
    rc.tier,
    rc.region,
    COUNT(*) AS total_transactions,
    SUM(ct.net_amount) AS lifetime_value,
    AVG(ct.net_amount) AS avg_transaction_value,
    MIN(ct.transaction_date) AS first_purchase,
    MAX(ct.transaction_date) AS last_purchase,
    COUNT(DISTINCT DATE_TRUNC('month', ct.transaction_date)) AS active_months,
    CASE
        WHEN MAX(ct.transaction_date) >= CURRENT_DATE - INTERVAL '30 days' THEN 'Active'
        WHEN MAX(ct.transaction_date) >= CURRENT_DATE - INTERVAL '90 days' THEN 'At Risk'
        ELSE 'Churned'
    END AS status
FROM cleaned_transactions ct
JOIN raw_customers rc ON ct.customer_id = rc.customer_id
WHERE ct.is_completed = TRUE
GROUP BY ct.customer_id, rc.name, rc.tier, rc.region;

CREATE VIEW product_performance AS
SELECT
    ep.product_id,
    ep.product_name,
    ep.category,
    ep.subcategory,
    ep.price_tier,
    ep.margin_percent,
    COUNT(*) AS times_sold,
    SUM(ct.quantity) AS total_quantity,
    SUM(ct.net_amount) AS total_revenue,
    AVG(ct.net_amount) AS avg_sale_amount,
    RANK() OVER (PARTITION BY ep.category ORDER BY SUM(ct.net_amount) DESC) AS category_rank,
    RANK() OVER (ORDER BY SUM(ct.net_amount) DESC) AS overall_rank
FROM enriched_products ep
JOIN cleaned_transactions ct ON ep.product_id = ct.product_id
WHERE ct.is_completed = TRUE
GROUP BY ep.product_id, ep.product_name, ep.category, ep.subcategory,
         ep.price_tier, ep.margin_percent;

-- ============================================================
-- STAGE 4: Analytics Views
-- ============================================================
-- Third transformation layer - business analytics

CREATE VIEW customer_segments AS
SELECT
    cm.customer_id,
    cm.customer_name,
    cm.region,
    cm.lifetime_value,
    cm.total_transactions,
    cm.status,
    CASE
        WHEN cm.lifetime_value >= 10000 THEN 'VIP'
        WHEN cm.lifetime_value >= 5000 THEN 'High Value'
        WHEN cm.lifetime_value >= 1000 THEN 'Medium Value'
        ELSE 'Low Value'
    END AS value_segment,
    CASE
        WHEN cm.total_transactions >= 50 THEN 'Frequent'
        WHEN cm.total_transactions >= 20 THEN 'Regular'
        WHEN cm.total_transactions >= 5 THEN 'Occasional'
        ELSE 'Rare'
    END AS frequency_segment,
    NTILE(10) OVER (ORDER BY cm.lifetime_value DESC) AS value_decile
FROM customer_metrics cm
WHERE cm.status != 'Churned';

CREATE VIEW regional_analysis AS
SELECT
    ds.region,
    ds.report_date,
    ds.net_revenue,
    ds.transaction_count,
    ds.unique_customers,
    SUM(ds.net_revenue) OVER (
        PARTITION BY ds.region
        ORDER BY ds.report_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_7day_revenue,
    AVG(ds.net_revenue) OVER (
        PARTITION BY ds.region
        ORDER BY ds.report_date
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) AS rolling_30day_avg,
    LAG(ds.net_revenue, 7) OVER (
        PARTITION BY ds.region
        ORDER BY ds.report_date
    ) AS revenue_7days_ago,
    ds.net_revenue - LAG(ds.net_revenue, 7) OVER (
        PARTITION BY ds.region
        ORDER BY ds.report_date
    ) AS wow_change
FROM daily_sales ds;

-- ============================================================
-- STAGE 5: Executive Dashboard
-- ============================================================
-- Final layer - executive-ready summaries

CREATE VIEW executive_summary AS
SELECT
    'Total Revenue' AS metric,
    SUM(net_revenue)::VARCHAR AS value,
    'currency' AS format
FROM daily_sales
WHERE report_date >= DATE_TRUNC('month', CURRENT_DATE)

UNION ALL

SELECT
    'Active Customers' AS metric,
    COUNT(DISTINCT customer_id)::VARCHAR AS value,
    'number' AS format
FROM customer_metrics
WHERE status = 'Active'

UNION ALL

SELECT
    'Avg Order Value' AS metric,
    ROUND(AVG(avg_transaction_value), 2)::VARCHAR AS value,
    'currency' AS format
FROM customer_metrics

UNION ALL

SELECT
    'Top Product' AS metric,
    product_name AS value,
    'text' AS format
FROM product_performance
WHERE overall_rank = 1;

CREATE VIEW monthly_trends AS
SELECT
    DATE_TRUNC('month', report_date) AS month,
    SUM(net_revenue) AS monthly_revenue,
    SUM(transaction_count) AS monthly_transactions,
    SUM(unique_customers) AS monthly_unique_customers,
    LAG(SUM(net_revenue)) OVER (ORDER BY DATE_TRUNC('month', report_date)) AS prev_month_revenue,
    ROUND(
        100.0 * (SUM(net_revenue) - LAG(SUM(net_revenue)) OVER (ORDER BY DATE_TRUNC('month', report_date))) /
        NULLIF(LAG(SUM(net_revenue)) OVER (ORDER BY DATE_TRUNC('month', report_date)), 0),
        2
    ) AS mom_growth_pct
FROM daily_sales
GROUP BY DATE_TRUNC('month', report_date)
ORDER BY month;

-- ============================================================
-- USAGE QUERIES
-- ============================================================
-- Example queries that consume the pipeline views

-- Get VIP customers with their recent activity
SELECT
    cs.customer_name,
    cs.value_segment,
    cs.frequency_segment,
    cs.lifetime_value,
    ra.report_date AS last_region_activity,
    ra.net_revenue AS region_daily_revenue
FROM customer_segments cs
LEFT JOIN regional_analysis ra ON cs.region = ra.region
WHERE cs.value_segment = 'VIP'
ORDER BY cs.lifetime_value DESC
LIMIT 100;

-- Monthly performance by product category
SELECT
    pp.category,
    COUNT(*) AS products,
    SUM(pp.total_revenue) AS category_revenue,
    AVG(pp.margin_percent) AS avg_margin
FROM product_performance pp
GROUP BY pp.category
ORDER BY category_revenue DESC;
