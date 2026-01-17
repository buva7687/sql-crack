-- ============================================================
-- CASE Expressions - Comprehensive Examples
-- ============================================================
-- This file demonstrates CASE statement patterns
--
-- Features covered:
--   1. Simple CASE expression
--   2. Searched CASE expression
--   3. Nested CASE statements
--   4. CASE in SELECT, WHERE, ORDER BY
--   5. CASE with aggregation
--   6. CASE with NULL handling
--   7. COALESCE and NULLIF alternatives
--   8. Multiple conditions and complex logic
--
-- Use these examples to test:
--   - CASE node visualization
--   - Conditional branching in flow
--   - Expression transformation tracking
-- ============================================================

-- ============================================================
-- 1. Simple CASE Expression (Equality Matching)
-- ============================================================
SELECT
    customer_id,
    tier,
    CASE tier
        WHEN 'Platinum' THEN 'Premium Customer'
        WHEN 'Gold' THEN 'Valued Customer'
        WHEN 'Silver' THEN 'Regular Customer'
        ELSE 'New Customer'
    END AS tier_description
FROM customers;

-- ============================================================
-- 2. Searched CASE Expression (Condition-based)
-- ============================================================
SELECT
    customer_id,
    total_amount,
    CASE
        WHEN total_amount < 100 THEN 'Low'
        WHEN total_amount < 500 THEN 'Medium'
        WHEN total_amount < 1000 THEN 'High'
        ELSE 'Very High'
    END AS order_size,
    CASE
        WHEN status = 'completed' THEN 1
        WHEN status = 'pending' THEN 0
        ELSE -1
    END AS status_code,
    CASE
        WHEN total_amount > 1000 THEN 'Priority'
        WHEN total_amount > 500 THEN 'Standard'
        ELSE 'Regular'
    END AS shipping_tier
FROM orders
WHERE order_date >= '2024-01-01';

-- ============================================================
-- 3. CASE in SELECT with Multiple Columns
-- ============================================================
SELECT
    p.product_id,
    p.product_name,
    p.price,
    p.cost,
    CASE
        WHEN p.cost IS NULL THEN 'Unknown'
        WHEN (p.price - p.cost) / p.price * 100 >= 50 THEN 'High Margin'
        WHEN (p.price - p.cost) / p.price * 100 >= 30 THEN 'Good Margin'
        WHEN (p.price - p.cost) / p.price * 100 >= 15 THEN 'Low Margin'
        ELSE 'Negative Margin'
    END AS margin_category,
    CASE
        WHEN p.active THEN 'Active'
        ELSE 'Discontinued'
    END AS product_status
FROM products p;

-- ============================================================
-- 4. Nested CASE Statements
-- ============================================================
SELECT
    c.customer_id,
    c.customer_name,
    c.tier,
    c.region,
    CASE
        WHEN c.tier = 'Platinum' THEN
            CASE
                WHEN c.region = 'North' THEN 'VIP North'
                WHEN c.region = 'South' THEN 'VIP South'
                ELSE 'VIP Other'
            END
        WHEN c.tier = 'Gold' THEN
            CASE
                WHEN c.region = 'North' THEN 'Gold North'
                ELSE 'Gold Other'
            END
        ELSE 'Standard'
    END AS customer_segment
FROM customers c
WHERE c.status = 'active';

-- ============================================================
-- 5. CASE in WHERE Clause
-- ============================================================
SELECT
    order_id,
    customer_id,
    total_amount,
    status
FROM orders
WHERE CASE
    WHEN status = 'completed' THEN total_amount > 100
    WHEN status = 'pending' THEN total_amount > 500
    ELSE FALSE
END;

-- ============================================================
-- 6. CASE in ORDER BY Clause
-- ============================================================
SELECT
    customer_id,
    customer_name,
    tier,
    registration_date
FROM customers
ORDER BY
    CASE tier
        WHEN 'Platinum' THEN 1
        WHEN 'Gold' THEN 2
        WHEN 'Silver' THEN 3
        ELSE 4
    END,
    registration_date DESC;

-- ============================================================
-- 7. CASE with Aggregation (Conditional Counting)
-- ============================================================
SELECT
    c.region,
    COUNT(*) AS total_customers,
    SUM(CASE WHEN c.tier = 'Platinum' THEN 1 ELSE 0 END) AS platinum_count,
    SUM(CASE WHEN c.tier = 'Gold' THEN 1 ELSE 0 END) AS gold_count,
    SUM(CASE WHEN c.tier = 'Silver' THEN 1 ELSE 0 END) AS silver_count,
    SUM(CASE WHEN c.tier = 'Basic' THEN 1 ELSE 0 END) AS basic_count,
    ROUND(
        100.0 * SUM(CASE WHEN c.tier IN ('Platinum', 'Gold') THEN 1 ELSE 0 END) / COUNT(*),
        2
    ) AS premium_percentage
FROM customers c
WHERE c.status = 'active'
GROUP BY c.region
ORDER BY premium_percentage DESC;

-- ============================================================
-- 8. CASE for Pivoting Data
-- ============================================================
SELECT
    DATE_TRUNC('month', order_date) AS month,
    SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END) AS completed_revenue,
    SUM(CASE WHEN status = 'cancelled' THEN total_amount ELSE 0 END) AS cancelled_value,
    SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END) AS refunded_value,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count
FROM orders
WHERE order_date >= '2024-01-01'
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY month;

-- ============================================================
-- 9. CASE with NULL Handling
-- ============================================================
SELECT
    p.product_id,
    p.product_name,
    p.category,
    p.subcategory,
    CASE
        WHEN p.subcategory IS NULL THEN p.category
        ELSE p.category || ' > ' || p.subcategory
    END AS full_category,
    COALESCE(p.brand, 'Generic') AS brand_display,
    CASE
        WHEN p.discontinued_date IS NOT NULL THEN 'Discontinued'
        WHEN p.launch_date > CURRENT_DATE THEN 'Coming Soon'
        WHEN p.active THEN 'Available'
        ELSE 'Out of Stock'
    END AS availability_status
FROM products p;

-- ============================================================
-- 10. CASE with Date Calculations
-- ============================================================
SELECT
    o.order_id,
    o.customer_id,
    o.order_date,
    o.status,
    CASE
        WHEN o.order_date >= CURRENT_DATE - INTERVAL '7 days' THEN 'This Week'
        WHEN o.order_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'This Month'
        WHEN o.order_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'This Quarter'
        WHEN o.order_date >= CURRENT_DATE - INTERVAL '365 days' THEN 'This Year'
        ELSE 'Older'
    END AS recency_bucket,
    CASE
        WHEN EXTRACT(DOW FROM o.order_date) IN (0, 6) THEN 'Weekend'
        ELSE 'Weekday'
    END AS day_type
FROM orders o
WHERE o.status = 'completed';

-- ============================================================
-- 11. Complex Multi-Column CASE Logic
-- ============================================================
SELECT
    c.customer_id,
    c.customer_name,
    c.tier,
    c.region,
    o.total_orders,
    o.total_spent,
    CASE
        WHEN c.tier = 'Platinum' AND o.total_spent > 50000 THEN 'Enterprise VIP'
        WHEN c.tier = 'Platinum' THEN 'VIP'
        WHEN c.tier = 'Gold' AND o.total_spent > 20000 THEN 'High Value Gold'
        WHEN c.tier = 'Gold' AND o.total_orders > 50 THEN 'Frequent Gold'
        WHEN c.tier = 'Gold' THEN 'Gold'
        WHEN o.total_spent > 10000 THEN 'Emerging High Value'
        WHEN o.total_orders > 20 THEN 'Frequent Buyer'
        ELSE 'Standard'
    END AS customer_classification,
    CASE
        WHEN o.last_order_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'Active'
        WHEN o.last_order_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'Engaged'
        WHEN o.last_order_date >= CURRENT_DATE - INTERVAL '180 days' THEN 'At Risk'
        ELSE 'Dormant'
    END AS engagement_status
FROM customers c
JOIN (
    SELECT
        customer_id,
        COUNT(*) AS total_orders,
        SUM(total_amount) AS total_spent,
        MAX(order_date) AS last_order_date
    FROM orders
    WHERE status = 'completed'
    GROUP BY customer_id
) o ON c.customer_id = o.customer_id
WHERE c.status = 'active'
ORDER BY o.total_spent DESC;
