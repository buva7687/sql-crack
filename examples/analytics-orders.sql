-- ============================================================
-- Order Analytics Queries
-- ============================================================
-- This file contains order-focused analytical queries
-- References tables from: order-schema.sql, product-schema.sql
-- Dialect: PostgreSQL / Snowflake

-- Query 1: Daily order trends with week-over-week comparison
WITH daily_orders AS (
    SELECT 
        o.order_date,
        COUNT(DISTINCT o.order_id) AS total_orders,
        SUM(o.total_amount) AS total_revenue,
        COUNT(DISTINCT o.customer_id) AS unique_customers,
        AVG(o.total_amount) AS avg_order_value
    FROM orders o
    WHERE o.order_date >= CURRENT_DATE - INTERVAL '60 days'
        AND o.status IN ('completed', 'delivered', 'shipped')
    GROUP BY o.order_date
),
weekly_comparison AS (
    SELECT 
        do1.order_date,
        do1.total_orders,
        do1.total_revenue,
        do1.unique_customers,
        do1.avg_order_value,
        -- Week ago data
        LAG(do1.total_orders, 7) OVER (ORDER BY do1.order_date) AS orders_7d_ago,
        LAG(do1.total_revenue, 7) OVER (ORDER BY do1.order_date) AS revenue_7d_ago,
        -- Week-over-week growth
        ROUND(
            100.0 * (do1.total_orders - LAG(do1.total_orders, 7) OVER (ORDER BY do1.order_date)) /
            NULLIF(LAG(do1.total_orders, 7) OVER (ORDER BY do1.order_date), 0),
            2
        ) AS wow_growth_orders_pct,
        ROUND(
            100.0 * (do1.total_revenue - LAG(do1.total_revenue, 7) OVER (ORDER BY do1.order_date)) /
            NULLIF(LAG(do1.total_revenue, 7) OVER (ORDER BY do1.order_date), 0),
            2
        ) AS wow_growth_revenue_pct
    FROM daily_orders do1
)
SELECT *
FROM weekly_comparison
WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY order_date DESC;

-- Query 2: Product sales performance ranking
WITH product_sales AS (
    SELECT 
        p.product_id,
        p.product_name,
        p.category,
        p.brand,
        -- Sales metrics
        COUNT(DISTINCT oi.order_id) AS order_count,
        SUM(oi.quantity) AS total_quantity_sold,
        SUM(oi.total_price) AS total_revenue,
        -- Profitability
        SUM(oi.quantity * (oi.unit_price - p.cost)) AS total_profit,
        AVG(oi.unit_price) AS avg_selling_price,
        -- Inventory status
        i.stock_quantity,
        i.reorder_level
    FROM products p
    JOIN order_items oi ON p.product_id = oi.product_id
    JOIN orders o ON oi.order_id = o.order_id
    LEFT JOIN inventory i ON p.product_id = i.product_id
    WHERE o.order_date >= CURRENT_DATE - INTERVAL '90 days'
        AND o.status IN ('completed', 'delivered')
    GROUP BY p.product_id, p.product_name, p.category, p.brand, p.cost, i.stock_quantity, i.reorder_level
)
SELECT 
    product_id,
    product_name,
    category,
    brand,
    order_count,
    total_quantity_sold,
    total_revenue,
    total_profit,
    ROUND(100.0 * total_profit / NULLIF(total_revenue, 0), 2) AS profit_margin_pct,
    stock_quantity,
    -- Performance ranking
    RANK() OVER (ORDER BY total_revenue DESC) AS revenue_rank,
    RANK() OVER (ORDER BY total_profit DESC) AS profit_rank,
    RANK() OVER (ORDER BY order_count DESC) AS popularity_rank
FROM product_sales
ORDER BY total_revenue DESC;

-- Query 3: Order fulfillment analysis
SELECT 
    o.status AS order_status,
    COUNT(*) AS order_count,
    SUM(o.total_amount) AS total_value,
    AVG(DATEDIFF('day', o.order_date, o.updated_at)) AS avg_processing_days,
    -- Order aging
    SUM(CASE 
        WHEN o.order_date < CURRENT_DATE - INTERVAL '7 days' 
             AND o.status NOT IN ('delivered', 'cancelled') 
        THEN 1 ELSE 0 
    END) AS overdue_orders,
    -- Shipping efficiency
    AVG(CASE 
        WHEN o.status = 'delivered' 
        THEN DATEDIFF('day', o.order_date, o.updated_at) 
        ELSE NULL 
    END) AS avg_delivery_days
FROM orders o
WHERE o.order_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY o.status
ORDER BY 
    CASE o.status
        WHEN 'pending' THEN 1
        WHEN 'confirmed' THEN 2
        WHEN 'processing' THEN 3
        WHEN 'shipped' THEN 4
        WHEN 'delivered' THEN 5
        WHEN 'cancelled' THEN 6
        WHEN 'refunded' THEN 7
    END;

-- Query 4: Cross-selling opportunity analysis
WITH product_pairs AS (
    SELECT 
        oi1.product_id AS product_a,
        oi2.product_id AS product_b,
        COUNT(DISTINCT oi1.order_id) AS purchase_frequency,
        -- Confidence metric: how often B is bought when A is bought
        COUNT(DISTINCT oi1.order_id) * 100.0 / 
            SUM(COUNT(DISTINCT oi2.order_id)) OVER (PARTITION BY oi1.product_id) AS confidence_pct
    FROM order_items oi1
    JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.item_id < oi2.item_id
    JOIN orders o ON oi1.order_id = o.order_id
    WHERE o.order_date >= CURRENT_DATE - INTERVAL '180 days'
        AND oi1.product_id != oi2.product_id
    GROUP BY oi1.product_id, oi2.product_id
),
cross_sell_recommendations AS (
    SELECT 
        product_a,
        product_b,
        purchase_frequency,
        confidence_pct,
        RANK() OVER (PARTITION BY product_a ORDER BY purchase_frequency DESC) AS recommendation_rank
    FROM product_pairs
    WHERE purchase_frequency >= 5  -- Minimum co-occurrence threshold
        AND confidence_pct >= 10   -- Minimum confidence threshold
)
SELECT 
    p1.product_name AS base_product,
    p2.product_name AS recommended_product,
    p2.category AS recommended_category,
    csr.purchase_frequency AS times_bought_together,
    ROUND(csrs.confidence_pct, 2) AS confidence_pct,
    csr.recommendation_rank
FROM cross_sell_recommendations csr
JOIN products p1 ON csr.product_a = p1.product_id
JOIN products p2 ON csr.product_b = p2.product_id
WHERE csr.recommendation_rank <= 5  -- Top 5 recommendations per product
ORDER BY csr.product_a, csr.purchase_frequency DESC;
