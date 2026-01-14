-- ============================================================
-- Simple Column Lineage Test Queries
-- ============================================================
-- Quick tests for column flow visualization
-- ============================================================

-- Test 1: Basic Passthrough
SELECT id, name, email FROM users;

-- Test 2: Renamed Columns
SELECT 
    id AS user_id,
    name AS user_name,
    email AS user_email
FROM users;

-- Test 3: Aggregated
SELECT 
    department,
    COUNT(*) AS employee_count,
    AVG(salary) AS avg_salary
FROM employees
GROUP BY department;

-- Test 4: Calculated Expression
SELECT 
    id,
    first_name,
    last_name,
    first_name || ' ' || last_name AS full_name,
    salary * 12 AS annual_salary
FROM employees;

-- Test 5: Window Function
SELECT 
    id,
    salary,
    department,
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS rank
FROM employees;

-- Test 6: CASE Statement
SELECT 
    id,
    salary,
    CASE 
        WHEN salary > 100000 THEN 'High'
        WHEN salary > 50000 THEN 'Medium'
        ELSE 'Low'
    END AS salary_category
FROM employees;

-- Test 7: JOIN with Transformations
SELECT 
    o.id AS order_id,
    c.name AS customer_name,
    SUM(oi.quantity * oi.price) AS total
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, c.name;

