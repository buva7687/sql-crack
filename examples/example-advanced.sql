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

-- ============================================
-- Additional DDLs for workspace dependency testing
-- These create cross-file dependencies
-- ============================================

-- Table: Employees (for testing)
CREATE TABLE employees (
    employee_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    department_id INT,
    salary DECIMAL(10,2),
    hire_date DATE,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- Table: Departments (for testing)
CREATE TABLE departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    budget DECIMAL(12,2)
);

-- View: Employee summary with product data from other files
CREATE VIEW employee_purchase_summary AS
SELECT
    e.employee_id,
    e.name AS employee_name,
    d.name AS department_name,
    e.salary,
    COUNT(DISTINCT o.id) AS orders_placed,
    SUM(oi.subtotal) AS total_purchased
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN users u ON e.email = u.email
LEFT JOIN orders o ON u.id = o.user_id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY e.employee_id, e.name, d.name, e.salary;

-- View referencing views from example-schema.sql
CREATE VIEW department_customer_overlap AS
SELECT
    d.name AS department,
    pp.product_name,
    pp.avg_rating,
    uos.username,
    uos.total_spent
FROM departments d
CROSS JOIN product_popularity pp
INNER JOIN user_order_summary uos ON uos.total_orders > 0
WHERE pp.avg_rating > 4.0;
