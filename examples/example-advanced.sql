-- Advanced SQL Features Demo: CTEs, Window Functions, Subqueries, and Set Operations

-- Example 1: CTE (Common Table Expression) with Window Function
WITH ranked_employees AS (
    SELECT
        employee_id,
        department_id,
        salary,
        ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) as salary_rank
    FROM employees
)
SELECT
    employee_id,
    department_id,
    salary,
    salary_rank
FROM ranked_employees
WHERE salary_rank <= 3;

-- Example 2: Multiple CTEs
WITH
    department_totals AS (
        SELECT
            department_id,
            SUM(salary) as total_salary,
            COUNT(*) as employee_count
        FROM employees
        GROUP BY department_id
    ),
    top_departments AS (
        SELECT
            department_id,
            total_salary
        FROM department_totals
        WHERE total_salary > 100000
    )
SELECT
    d.name,
    dt.total_salary,
    dt.employee_count
FROM top_departments td
JOIN department_totals dt ON td.department_id = dt.department_id
JOIN departments d ON d.id = dt.department_id;

-- Example 3: Window Functions - Running Total
SELECT
    order_date,
    order_id,
    amount,
    SUM(amount) OVER (ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_total,
    AVG(amount) OVER (PARTITION BY MONTH(order_date) ORDER BY order_date) as monthly_avg
FROM orders;

-- Example 4: Subquery in FROM clause
SELECT
    dept_name,
    avg_salary,
    employee_count
FROM (
    SELECT
        d.name as dept_name,
        AVG(e.salary) as avg_salary,
        COUNT(e.id) as employee_count
    FROM employees e
    JOIN departments d ON e.department_id = d.id
    join salary s on e.name =s.name 
    GROUP BY d.name
) AS department_stats
WHERE avg_salary > 50000;

-- Example 5: UNION - Combine active and inactive users
SELECT
    id,
    username,
    email,
    'active' as status
FROM users
WHERE is_active = TRUE

UNION

SELECT
    id,
    username,
    email,
    'inactive' as status
FROM users
WHERE is_active = FALSE;

-- Example 6: Complex query with CTE and Window Function
WITH monthly_sales AS (
    SELECT
        DATE_TRUNC('month', order_date) as month,
        product_id,
        SUM(quantity * unit_price) as total_sales
    FROM order_items
    JOIN orders ON order_items.order_id = orders.id
    GROUP BY DATE_TRUNC('month', order_date), product_id
)
SELECT
    month,
    product_id,
    total_sales,
    LAG(total_sales, 1) OVER (PARTITION BY product_id ORDER BY month) as prev_month_sales,
    total_sales - LAG(total_sales, 1) OVER (PARTITION BY product_id ORDER BY month) as sales_change
FROM monthly_sales
ORDER BY product_id, month;

-- Example 7: Subquery in WHERE clause
SELECT
    name,
    email,
    salary
FROM employees
WHERE salary > (
    SELECT AVG(salary)
    FROM employees
)
ORDER BY salary DESC;


-- Advanced SQL Features Demo: CTEs, Window Functions, Subqueries, and Set Operations

-- Example 1: CTE (Common Table Expression) with Window Function
WITH ranked_employees AS (
    SELECT
        employee_id,
        department_id,
        salary,
        ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) as salary_rank
    FROM employees
)
SELECT
    employee_id,
    department_id,
    salary,
    salary_rank
FROM ranked_employees
WHERE salary_rank <= 3;

-- Example 2: Multiple CTEs
WITH
    department_totals AS (
        SELECT
            department_id,
            SUM(salary) as total_salary,
            COUNT(*) as employee_count
        FROM employees
        GROUP BY department_id
    ),
    top_departments AS (
        SELECT
            department_id,
            total_salary
        FROM department_totals
        WHERE total_salary > 100000
    )
SELECT
    d.name,
    dt.total_salary,
    dt.employee_count
FROM top_departments td
JOIN department_totals dt ON td.department_id = dt.department_id
JOIN departments d ON d.id = dt.department_id;

-- Example 3: Window Functions - Running Total
SELECT
    order_date,
    order_id,
    amount,
    SUM(amount) OVER (ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_total,
    AVG(amount) OVER (PARTITION BY MONTH(order_date) ORDER BY order_date) as monthly_avg
FROM orders;

-- Example 4: Subquery in FROM clause
SELECT
    dept_name,
    avg_salary,
    employee_count
FROM (
    SELECT
        d.name as dept_name,
        AVG(e.salary) as avg_salary,
        COUNT(e.id) as employee_count
    FROM employees e
    JOIN departments d ON e.department_id = d.id
    GROUP BY d.name
) AS department_stats
WHERE avg_salary > 50000;

-- Example 5: UNION - Combine active and inactive users
SELECT
    id,
    username,
    email,
    'active' as status
FROM users
WHERE is_active = TRUE

UNION

SELECT
    id,
    username,
    email,
    'inactive' as status
FROM users
WHERE is_active = FALSE;

-- Example 6: Complex query with CTE and Window Function
WITH monthly_sales AS (
    SELECT
        DATE_TRUNC('month', order_date) as month,
        product_id,
        SUM(quantity * unit_price) as total_sales
    FROM order_items
    JOIN orders ON order_items.order_id = orders.id
    GROUP BY DATE_TRUNC('month', order_date), product_id
)
SELECT
    month,
    product_id,
    total_sales,
    LAG(total_sales, 1) OVER (PARTITION BY product_id ORDER BY month) as prev_month_sales,
    total_sales - LAG(total_sales, 1) OVER (PARTITION BY product_id ORDER BY month) as sales_change
FROM monthly_sales
ORDER BY product_id, month;

-- Example 7: Subquery in WHERE clause
SELECT
    name,
    email,
    salary
FROM employees
WHERE salary > (
    SELECT AVG(salary)
    FROM employees
)
ORDER BY salary DESC;
