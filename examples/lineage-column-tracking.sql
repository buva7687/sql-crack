-- ============================================================
-- Column-Level Lineage - Comprehensive Examples
-- ============================================================
-- This file demonstrates column flow visualization and tracking
--
-- Column transformation types:
--   1. Passthrough - Direct column selection
--   2. Renamed - Column with alias
--   3. Aggregated - GROUP BY with aggregate functions
--   4. Calculated - Expressions, arithmetic, functions
--   5. Joined - Columns from JOIN operations
--   6. Window - Window function outputs
--   7. Conditional - CASE statement outputs
--
-- Use these examples to test:
--   - Column lineage panel (press 'C')
--   - Click-to-trace column flow
--   - Transformation type detection
-- ============================================================

-- ============================================================
-- 1. Simple Passthrough and Renamed
-- ============================================================
-- Column flows:
--   - customer_id: passthrough (customers → result)
--   - customer_name: passthrough (customers → result)
--   - email_address: renamed (customers.email → result.email_address)
SELECT
    customer_id,
    customer_name,
    email AS email_address
FROM customers
WHERE status = 'active';

-- ============================================================
-- 2. Aggregated Columns
-- ============================================================
-- Column flows:
--   - category: passthrough via GROUP BY
--   - total_revenue: aggregated (price × quantity → SUM)
--   - avg_price: aggregated (price → AVG)
--   - product_count: aggregated (product_id → COUNT)
SELECT
    category,
    SUM(price * quantity) AS total_revenue,
    AVG(price) AS avg_price,
    COUNT(DISTINCT product_id) AS product_count
FROM products p
JOIN order_items oi ON p.product_id = oi.product_id
WHERE p.active = TRUE
GROUP BY category
HAVING SUM(price * quantity) > 10000
ORDER BY total_revenue DESC;

-- ============================================================
-- 3. Calculated Columns with Expressions
-- ============================================================
-- Column flows:
--   - product_id: passthrough
--   - full_name: calculated (first_name + last_name → concat)
--   - salary_after_tax: calculated (salary × 0.85)
--   - years_of_service: calculated (date arithmetic)
SELECT
    employee_id,
    first_name || ' ' || last_name AS full_name,
    salary * 0.85 AS salary_after_tax,
    EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM hire_date) AS years_of_service,
    salary / 12 AS monthly_salary
FROM employees
WHERE department = 'Sales';

-- ============================================================
-- 4. Complex Arithmetic Transformations
-- ============================================================
-- Column flows involve multiple source columns
SELECT
    product_id,
    quantity,
    unit_price,
    discount,
    quantity * unit_price AS subtotal,
    COALESCE(discount, 0) AS discount_applied,
    quantity * unit_price - COALESCE(discount, 0) AS line_total,
    ROUND((quantity * unit_price) * 0.1, 2) AS tax_amount,
    quantity * unit_price - COALESCE(discount, 0) + ROUND((quantity * unit_price) * 0.1, 2) AS grand_total
FROM order_items
WHERE quantity > 0
ORDER BY grand_total DESC;

-- ============================================================
-- 5. Window Functions (Calculated)
-- ============================================================
-- Column flows:
--   - salary_rank: calculated (ROW_NUMBER OVER)
--   - dept_avg_salary: calculated (AVG OVER)
--   - salary_diff: calculated (salary - window result)
SELECT
    employee_id,
    salary,
    department,
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS salary_rank,
    AVG(salary) OVER (PARTITION BY department) AS dept_avg_salary,
    salary - AVG(salary) OVER (PARTITION BY department) AS salary_diff_from_avg,
    RANK() OVER (ORDER BY salary DESC) AS overall_rank,
    PERCENT_RANK() OVER (PARTITION BY department ORDER BY salary) AS percentile
FROM employees
WHERE status = 'active'
ORDER BY department, salary DESC;

-- ============================================================
-- 6. CASE Statements (Conditional)
-- ============================================================
-- Column flows:
--   - salary_band: calculated (CASE on salary)
--   - performance_bonus: calculated (CASE on rating)
SELECT
    employee_id,
    salary,
    performance_rating,
    CASE
        WHEN salary < 50000 THEN 'Entry Level'
        WHEN salary < 100000 THEN 'Mid Level'
        WHEN salary < 150000 THEN 'Senior Level'
        ELSE 'Executive'
    END AS salary_band,
    CASE
        WHEN performance_rating >= 4.5 THEN salary * 0.15
        WHEN performance_rating >= 3.5 THEN salary * 0.10
        WHEN performance_rating >= 2.5 THEN salary * 0.05
        ELSE 0
    END AS performance_bonus
FROM employees
WHERE status = 'active';

-- ============================================================
-- 7. JOINs with Multiple Transformations
-- ============================================================
-- Column flows from multiple source tables
SELECT
    o.order_id,
    c.customer_name AS customer,
    p.product_name AS product,
    oi.quantity,
    oi.unit_price,
    oi.quantity * oi.unit_price AS line_total,
    SUM(oi.quantity * oi.unit_price) OVER (PARTITION BY o.order_id) AS order_total
FROM orders o
INNER JOIN customers c ON o.customer_id = c.customer_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id
WHERE o.status = 'completed'
ORDER BY o.order_id, line_total DESC;

-- ============================================================
-- 8. CTEs with Column Flows
-- ============================================================
-- Track columns through CTE chain
WITH employee_stats AS (
    -- First transformation: aggregate
    SELECT
        department,
        AVG(salary) AS avg_salary,
        MAX(salary) AS max_salary,
        MIN(salary) AS min_salary,
        COUNT(*) AS employee_count
    FROM employees
    WHERE status = 'active'
    GROUP BY department
),
enriched_stats AS (
    -- Second transformation: calculate
    SELECT
        department,
        avg_salary,
        max_salary,
        min_salary,
        employee_count,
        max_salary - min_salary AS salary_range,
        max_salary - avg_salary AS max_vs_avg
    FROM employee_stats
)
SELECT
    department,
    avg_salary,
    max_salary,
    salary_range,
    CASE
        WHEN salary_range > 50000 THEN 'High Variance'
        WHEN salary_range > 25000 THEN 'Medium Variance'
        ELSE 'Low Variance'
    END AS variance_category
FROM enriched_stats
ORDER BY salary_range DESC;

-- ============================================================
-- 9. Complex Multi-Stage Transformation
-- ============================================================
-- Full column lineage with all transformation types
WITH monthly_sales AS (
    -- Stage 1: Join and select
    SELECT
        o.customer_id,
        DATE_TRUNC('month', o.order_date) AS month,
        c.customer_name,
        c.region,
        p.category,
        oi.quantity,
        oi.unit_price,
        oi.quantity * oi.unit_price AS line_amount
    FROM orders o
    INNER JOIN customers c ON o.customer_id = c.customer_id
    INNER JOIN order_items oi ON o.order_id = oi.order_id
    INNER JOIN products p ON oi.product_id = p.product_id
    WHERE o.status = 'completed'
        AND o.order_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
),
aggregated_sales AS (
    -- Stage 2: Aggregate
    SELECT
        customer_id,
        customer_name,
        region,
        month,
        SUM(line_amount) AS monthly_revenue,
        COUNT(DISTINCT category) AS categories_purchased,
        SUM(quantity) AS total_items
    FROM monthly_sales
    GROUP BY customer_id, customer_name, region, month
)
-- Stage 3: Window functions and final output
SELECT
    customer_name,
    region,
    month,
    monthly_revenue,
    categories_purchased,
    total_items,
    SUM(monthly_revenue) OVER (PARTITION BY customer_id ORDER BY month) AS cumulative_revenue,
    LAG(monthly_revenue) OVER (PARTITION BY customer_id ORDER BY month) AS prev_month_revenue,
    monthly_revenue - LAG(monthly_revenue) OVER (PARTITION BY customer_id ORDER BY month) AS mom_change,
    RANK() OVER (PARTITION BY month ORDER BY monthly_revenue DESC) AS monthly_rank,
    CASE
        WHEN monthly_revenue >= 5000 THEN 'High'
        WHEN monthly_revenue >= 1000 THEN 'Medium'
        ELSE 'Low'
    END AS revenue_tier
FROM aggregated_sales
ORDER BY customer_name, month;

-- ============================================================
-- 10. Subquery Column Flow
-- ============================================================
-- Track columns through subquery
SELECT
    c.customer_name,
    c.tier,
    sq.total_orders,
    sq.total_spent,
    sq.avg_order_value,
    CASE
        WHEN sq.total_orders >= 50 THEN 'Platinum'
        WHEN sq.total_orders >= 20 THEN 'Gold'
        WHEN sq.total_orders >= 10 THEN 'Silver'
        ELSE 'Bronze'
    END AS calculated_tier
FROM customers c
INNER JOIN (
    SELECT
        customer_id,
        COUNT(*) AS total_orders,
        SUM(total_amount) AS total_spent,
        AVG(total_amount) AS avg_order_value
    FROM orders
    WHERE status = 'completed'
        AND order_date >= CURRENT_DATE - INTERVAL '1 year'
    GROUP BY customer_id
) sq ON c.customer_id = sq.customer_id
ORDER BY sq.total_spent DESC;
