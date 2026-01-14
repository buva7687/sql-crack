-- ============================================================
-- Column-Level Lineage Visualization Test Queries
-- ============================================================
-- This file contains sample SQL queries to test column flow visualization
-- Each query demonstrates different transformation types:
-- - Passthrough: Direct column selection
-- - Renamed: Columns with aliases
-- - Aggregated: GROUP BY with aggregate functions
-- - Calculated: Expressions, window functions, CASE statements
-- ============================================================

-- ============================================================
-- Query 1: Simple Passthrough and Renamed
-- ============================================================
-- Expected column flows:
-- - id: passthrough (employees.id -> result.id)
-- - name: passthrough (employees.name -> result.name)
-- - email: renamed (employees.email -> result.email_address)
-- ============================================================
SELECT 
    id,
    name,
    email AS email_address
FROM employees
WHERE department = 'Engineering';

-- ============================================================
-- Query 2: Aggregated Columns
-- ============================================================
-- Expected column flows:
-- - department: passthrough (employees.department -> GROUP BY -> result.department)
-- - total_salary: aggregated (employees.salary -> SUM() -> result.total_salary)
-- - avg_salary: aggregated (employees.salary -> AVG() -> result.avg_salary)
-- - employee_count: aggregated (employees.id -> COUNT() -> result.employee_count)
-- ============================================================
SELECT 
    department,
    SUM(salary) AS total_salary,
    AVG(salary) AS avg_salary,
    COUNT(id) AS employee_count
FROM employees
WHERE status = 'active'
GROUP BY department
HAVING COUNT(id) > 5
ORDER BY total_salary DESC;

-- ============================================================
-- Query 3: Calculated Columns with Expressions
-- ============================================================
-- Expected column flows:
-- - full_name: calculated (employees.first_name + employees.last_name -> result.full_name)
-- - salary_after_tax: calculated (employees.salary * 0.85 -> result.salary_after_tax)
-- - years_of_service: calculated (CURRENT_DATE - employees.hire_date -> result.years_of_service)
-- ============================================================
SELECT 
    id,
    first_name || ' ' || last_name AS full_name,
    salary * 0.85 AS salary_after_tax,
    EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM hire_date) AS years_of_service
FROM employees
WHERE department = 'Sales';

-- ============================================================
-- Query 4: Window Functions (Calculated)
-- ============================================================
-- Expected column flows:
-- - employee_id: passthrough
-- - salary: passthrough
-- - department: passthrough
-- - salary_rank: calculated (ROW_NUMBER() OVER -> result.salary_rank)
-- - dept_avg_salary: calculated (AVG() OVER -> result.dept_avg_salary)
-- - salary_diff_from_avg: calculated (salary - dept_avg_salary -> result.salary_diff_from_avg)
-- ============================================================
SELECT 
    employee_id,
    salary,
    department,
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS salary_rank,
    AVG(salary) OVER (PARTITION BY department) AS dept_avg_salary,
    salary - AVG(salary) OVER (PARTITION BY department) AS salary_diff_from_avg
FROM employees
WHERE status = 'active'
ORDER BY department, salary DESC;

-- ============================================================
-- Query 5: CASE Statements (Calculated)
-- ============================================================
-- Expected column flows:
-- - employee_id: passthrough
-- - salary: passthrough
-- - salary_band: calculated (CASE WHEN salary -> result.salary_band)
-- - performance_bonus: calculated (CASE WHEN performance_rating -> result.performance_bonus)
-- ============================================================
SELECT 
    employee_id,
    salary,
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
-- Query 6: JOINs with Multiple Transformations
-- ============================================================
-- Expected column flows:
-- - order_id: passthrough (orders.order_id -> result.order_id)
-- - customer_name: renamed (customers.name -> result.customer_name)
-- - order_total: aggregated (order_items.price * quantity -> SUM() -> result.order_total)
-- - item_count: aggregated (order_items.item_id -> COUNT() -> result.item_count)
-- - order_date: passthrough (orders.order_date -> result.order_date)
-- ============================================================
SELECT 
    o.order_id,
    c.name AS customer_name,
    SUM(oi.price * oi.quantity) AS order_total,
    COUNT(oi.item_id) AS item_count,
    o.order_date
FROM orders o
INNER JOIN customers c ON o.customer_id = c.customer_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
WHERE o.order_date >= '2024-01-01'
GROUP BY o.order_id, c.name, o.order_date
HAVING SUM(oi.price * oi.quantity) > 1000
ORDER BY order_total DESC;

-- ============================================================
-- Query 7: CTEs with Column Flows
-- ============================================================
-- Expected column flows:
-- CTE: employee_stats
--   - department: passthrough
--   - avg_salary: aggregated
--   - max_salary: aggregated
-- Main query:
--   - department: passthrough (from CTE)
--   - avg_salary: passthrough (from CTE)
--   - max_salary: passthrough (from CTE)
--   - salary_range: calculated (max_salary - avg_salary -> result.salary_range)
-- ============================================================
WITH employee_stats AS (
    SELECT 
        department,
        AVG(salary) AS avg_salary,
        MAX(salary) AS max_salary
    FROM employees
    WHERE status = 'active'
    GROUP BY department
)
SELECT 
    department,
    avg_salary,
    max_salary,
    max_salary - avg_salary AS salary_range
FROM employee_stats
WHERE avg_salary > 75000
ORDER BY salary_range DESC;

-- ============================================================
-- Query 8: Complex Query with All Transformation Types
-- ============================================================
-- This query demonstrates:
-- - Passthrough: employee_id, order_date
-- - Renamed: customer_name, product_name
-- - Aggregated: total_revenue, order_count
-- - Calculated: revenue_per_order, discount_applied, final_revenue
-- ============================================================
WITH monthly_sales AS (
    SELECT 
        o.employee_id,
        o.order_date,
        c.name AS customer_name,
        p.name AS product_name,
        oi.quantity,
        oi.price,
        oi.discount
    FROM orders o
    INNER JOIN customers c ON o.customer_id = c.customer_id
    INNER JOIN order_items oi ON o.order_id = oi.order_id
    INNER JOIN products p ON oi.product_id = p.product_id
    WHERE o.order_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')
)
SELECT 
    employee_id,
    DATE_TRUNC('month', order_date) AS order_month,
    customer_name,
    product_name,
    SUM(quantity * price) AS total_revenue,
    COUNT(DISTINCT order_date) AS order_count,
    SUM(quantity * price) / COUNT(DISTINCT order_date) AS revenue_per_order,
    CASE 
        WHEN SUM(quantity * price) > 5000 THEN SUM(quantity * price) * 0.10
        WHEN SUM(quantity * price) > 2000 THEN SUM(quantity * price) * 0.05
        ELSE 0
    END AS discount_applied,
    SUM(quantity * price) - 
    CASE 
        WHEN SUM(quantity * price) > 5000 THEN SUM(quantity * price) * 0.10
        WHEN SUM(quantity * price) > 2000 THEN SUM(quantity * price) * 0.05
        ELSE 0
    END AS final_revenue
FROM monthly_sales
GROUP BY employee_id, DATE_TRUNC('month', order_date), customer_name, product_name
HAVING SUM(quantity * price) > 1000
ORDER BY final_revenue DESC
LIMIT 50;

-- ============================================================
-- Query 9: Window Functions with PARTITION BY
-- ============================================================
-- Expected column flows:
-- - product_id: passthrough
-- - product_name: passthrough
-- - category: passthrough
-- - price: passthrough
-- - category_avg_price: calculated (AVG() OVER PARTITION BY category)
-- - price_vs_category_avg: calculated (price - category_avg_price)
-- - price_rank_in_category: calculated (RANK() OVER PARTITION BY category)
-- ============================================================
SELECT 
    product_id,
    product_name,
    category,
    price,
    AVG(price) OVER (PARTITION BY category) AS category_avg_price,
    price - AVG(price) OVER (PARTITION BY category) AS price_vs_category_avg,
    RANK() OVER (PARTITION BY category ORDER BY price DESC) AS price_rank_in_category
FROM products
WHERE status = 'active'
ORDER BY category, price DESC;

-- ============================================================
-- Query 10: Subquery with Column Flows
-- ============================================================
-- Expected column flows:
-- Subquery:
--   - customer_id: passthrough
--   - total_orders: aggregated
-- Main query:
--   - customer_name: passthrough
--   - total_orders: passthrough (from subquery)
--   - customer_tier: calculated (CASE WHEN total_orders -> result.customer_tier)
-- ============================================================
SELECT 
    c.name AS customer_name,
    sq.total_orders,
    CASE 
        WHEN sq.total_orders >= 50 THEN 'Platinum'
        WHEN sq.total_orders >= 20 THEN 'Gold'
        WHEN sq.total_orders >= 10 THEN 'Silver'
        ELSE 'Bronze'
    END AS customer_tier
FROM customers c
INNER JOIN (
    SELECT 
        customer_id,
        COUNT(order_id) AS total_orders
    FROM orders
    WHERE order_date >= CURRENT_DATE - INTERVAL '1 year'
    GROUP BY customer_id
) sq ON c.customer_id = sq.customer_id
ORDER BY total_orders DESC;

