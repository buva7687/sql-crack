-- Batch Processing Example: Multiple SQL Queries
-- This file contains multiple queries separated by semicolons

-- Query 1: Simple SELECT with JOIN
SELECT
    users.id,
    users.name,
    orders.order_date,
    orders.total
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.total > 100;

-- Query 2: Aggregate query with GROUP BY
SELECT
    department_id,
    COUNT(*) as employee_count,
    AVG(salary) as avg_salary
FROM employees
GROUP BY department_id
HAVING AVG(salary) > 50000;

-- Query 3: CTE with window function
WITH ranked_products AS (
    SELECT
        product_id,
        product_name,
        category_id,
        price,
        ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY price DESC) as price_rank
    FROM products
)
SELECT * FROM ranked_products WHERE price_rank <= 5;

-- Query 4: UNION operation
SELECT id, name, 'customer' as type FROM customers
UNION
SELECT id, name, 'supplier' as type FROM suppliers;

-- Query 5: Subquery in WHERE clause
SELECT
    name,
    salary
FROM employees
WHERE salary > (
    SELECT AVG(salary) FROM employees
);

-- Query 6: Multiple JOINs
SELECT
    o.order_id,
    c.customer_name,
    p.product_name,
    oi.quantity,
    oi.price
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE o.order_date >= '2024-01-01';
