-- ============================================================
-- Common Table Expressions (CTEs) - Comprehensive Examples
-- ============================================================
-- This file demonstrates CTE patterns for visualization
--
-- Features covered:
--   1. Simple CTE (single WITH clause)
--   2. Multiple CTEs (chained)
--   3. Nested/dependent CTEs
--   4. Recursive CTEs
--   5. CTEs with aggregations
--   6. CTEs with window functions
--   7. CTEs in subqueries
--
-- Use these examples to test:
--   - CTE cloud visualization
--   - CTE expansion (double-click)
--   - Breadcrumb navigation
--   - CTE dependency tracking
-- ============================================================

-- ============================================================
-- 1. Simple CTE
-- ============================================================
WITH high_value_orders AS (
    SELECT
        order_id,
        customer_id,
        total_amount,
        order_date
    FROM orders
    WHERE total_amount > 1000
        AND status = 'completed'
)
SELECT
    c.customer_name,
    hvo.order_id,
    hvo.total_amount,
    hvo.order_date
FROM high_value_orders hvo
JOIN customers c ON hvo.customer_id = c.customer_id
ORDER BY hvo.total_amount DESC;

-- ============================================================
-- 2. Multiple Independent CTEs
-- ============================================================
WITH
    customer_orders AS (
        SELECT
            customer_id,
            COUNT(*) AS order_count,
            SUM(total_amount) AS total_spent
        FROM orders
        WHERE status = 'completed'
        GROUP BY customer_id
    ),
    customer_reviews AS (
        SELECT
            customer_id,
            COUNT(*) AS review_count,
            AVG(rating) AS avg_rating
        FROM reviews
        GROUP BY customer_id
    )
SELECT
    c.customer_name,
    c.tier,
    COALESCE(co.order_count, 0) AS order_count,
    COALESCE(co.total_spent, 0) AS total_spent,
    COALESCE(cr.review_count, 0) AS review_count,
    COALESCE(cr.avg_rating, 0) AS avg_rating
FROM customers c
LEFT JOIN customer_orders co ON c.customer_id = co.customer_id
LEFT JOIN customer_reviews cr ON c.customer_id = cr.customer_id
WHERE c.status = 'active'
ORDER BY total_spent DESC;

-- ============================================================
-- 3. Chained/Dependent CTEs
-- ============================================================
WITH
    customer_totals AS (
        SELECT
            customer_id,
            COUNT(*) AS order_count,
            SUM(total_amount) AS total_spent
        FROM orders
        WHERE status = 'completed'
        GROUP BY customer_id
    ),
    high_value_customers AS (
        SELECT
            c.customer_id,
            c.customer_name,
            c.email,
            ct.order_count,
            ct.total_spent
        FROM customers c
        JOIN customer_totals ct ON c.customer_id = ct.customer_id
        WHERE ct.total_spent > 5000
    ),
    customer_with_recent_orders AS (
        SELECT
            hvc.*,
            (SELECT COUNT(*)
             FROM orders
             WHERE customer_id = hvc.customer_id
               AND order_date >= CURRENT_DATE - INTERVAL '90 days') AS recent_orders
        FROM high_value_customers hvc
    )
SELECT
    customer_id,
    customer_name,
    email,
    order_count,
    total_spent,
    recent_orders
FROM customer_with_recent_orders
ORDER BY total_spent DESC;

-- ============================================================
-- 4. Recursive CTE (Hierarchical Data)
-- ============================================================
WITH RECURSIVE employee_hierarchy AS (
    -- Base case: top-level employees (no manager)
    SELECT
        employee_id,
        name,
        manager_id,
        department,
        1 AS level,
        name AS hierarchy_path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive case: employees with managers
    SELECT
        e.employee_id,
        e.name,
        e.manager_id,
        e.department,
        eh.level + 1,
        eh.hierarchy_path || ' > ' || e.name
    FROM employees e
    JOIN employee_hierarchy eh ON e.manager_id = eh.employee_id
)
SELECT
    employee_id,
    name,
    department,
    level,
    hierarchy_path
FROM employee_hierarchy
ORDER BY hierarchy_path;

-- ============================================================
-- 5. CTE with Window Functions
-- ============================================================
WITH ranked_products AS (
    SELECT
        product_id,
        product_name,
        category,
        price,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) AS price_rank,
        AVG(price) OVER (PARTITION BY category) AS category_avg_price
    FROM products
    WHERE active = TRUE
)
SELECT
    product_id,
    product_name,
    category,
    price,
    price_rank,
    category_avg_price,
    price - category_avg_price AS price_vs_avg
FROM ranked_products
WHERE price_rank <= 5
ORDER BY category, price_rank;

-- ============================================================
-- 6. CTE with Aggregation and Filtering
-- ============================================================
WITH monthly_sales AS (
    SELECT
        DATE_TRUNC('month', order_date) AS month,
        customer_id,
        SUM(total_amount) AS monthly_total
    FROM orders
    WHERE status = 'completed'
        AND order_date >= '2024-01-01'
    GROUP BY DATE_TRUNC('month', order_date), customer_id
),
customer_monthly_avg AS (
    SELECT
        customer_id,
        AVG(monthly_total) AS avg_monthly_spend,
        MAX(monthly_total) AS max_monthly_spend
    FROM monthly_sales
    GROUP BY customer_id
    HAVING COUNT(*) >= 3  -- At least 3 months of data
)
SELECT
    c.customer_name,
    c.tier,
    cma.avg_monthly_spend,
    cma.max_monthly_spend
FROM customer_monthly_avg cma
JOIN customers c ON cma.customer_id = c.customer_id
ORDER BY cma.avg_monthly_spend DESC
LIMIT 20;

-- ============================================================
-- 7. Deeply Nested CTEs (3+ levels)
-- ============================================================
WITH
    -- Level 1: Raw data aggregation
    order_stats AS (
        SELECT
            customer_id,
            COUNT(*) AS order_count,
            SUM(total_amount) AS total_spent,
            AVG(total_amount) AS avg_order_value
        FROM orders
        WHERE status = 'completed'
        GROUP BY customer_id
    ),
    -- Level 2: Add window functions
    ranked_customers AS (
        SELECT
            os.customer_id,
            os.order_count,
            os.total_spent,
            os.avg_order_value,
            RANK() OVER (ORDER BY os.total_spent DESC) AS spend_rank,
            AVG(os.total_spent) OVER () AS overall_avg_spent
        FROM order_stats os
    ),
    -- Level 3: Segmentation
    customer_segments AS (
        SELECT
            rc.*,
            CASE
                WHEN rc.total_spent > rc.overall_avg_spent * 2 THEN 'VIP'
                WHEN rc.total_spent > rc.overall_avg_spent THEN 'High Value'
                WHEN rc.total_spent > rc.overall_avg_spent * 0.5 THEN 'Medium Value'
                ELSE 'Low Value'
            END AS segment
        FROM ranked_customers rc
    )
SELECT
    c.customer_name,
    c.email,
    cs.order_count,
    cs.total_spent,
    cs.spend_rank,
    cs.segment
FROM customer_segments cs
JOIN customers c ON cs.customer_id = c.customer_id
WHERE cs.spend_rank <= 100
ORDER BY cs.spend_rank;

-- ============================================================
-- 8. CTE with UNION
-- ============================================================
WITH all_transactions AS (
    SELECT
        'order' AS transaction_type,
        order_id AS transaction_id,
        customer_id,
        total_amount AS amount,
        order_date AS transaction_date
    FROM orders
    WHERE status = 'completed'

    UNION ALL

    SELECT
        'refund' AS transaction_type,
        return_id AS transaction_id,
        customer_id,
        -refund_amount AS amount,
        return_date AS transaction_date
    FROM order_returns
    WHERE status = 'refunded'
)
SELECT
    c.customer_name,
    at.transaction_type,
    COUNT(*) AS transaction_count,
    SUM(at.amount) AS net_amount
FROM all_transactions at
JOIN customers c ON at.customer_id = c.customer_id
GROUP BY c.customer_name, at.transaction_type
ORDER BY c.customer_name, at.transaction_type;

-- ============================================================
-- 9. CTE with Complex CASE Logic
-- ============================================================
WITH order_analysis AS (
    SELECT
        o.order_id,
        o.customer_id,
        o.total_amount,
        o.order_date,
        CASE
            WHEN o.total_amount >= 500 THEN 'Large'
            WHEN o.total_amount >= 100 THEN 'Medium'
            ELSE 'Small'
        END AS order_size,
        CASE
            WHEN o.order_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'Recent'
            WHEN o.order_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'Last Quarter'
            ELSE 'Older'
        END AS recency
    FROM orders o
    WHERE o.status = 'completed'
)
SELECT
    recency,
    order_size,
    COUNT(*) AS order_count,
    SUM(total_amount) AS total_revenue,
    AVG(total_amount) AS avg_order_value
FROM order_analysis
GROUP BY recency, order_size
ORDER BY recency, order_size;
