-- Basic MySQL test queries

-- Simple SELECT
SELECT * FROM users;

-- SELECT with columns
SELECT id, name, email FROM users;

-- SELECT with WHERE
SELECT * FROM users WHERE active = 1;

-- SELECT with ORDER BY
SELECT * FROM users ORDER BY created_at DESC;

-- SELECT with LIMIT
SELECT * FROM users LIMIT 10;

-- SELECT with JOIN
SELECT u.id, u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id;

-- SELECT with LEFT JOIN
SELECT u.id, u.name, o.total
FROM users u
LEFT JOIN orders o ON u.id = o.user_id;

-- SELECT with GROUP BY
SELECT department, COUNT(*) as count
FROM employees
GROUP BY department;

-- SELECT with HAVING
SELECT department, COUNT(*) as count
FROM employees
GROUP BY department
HAVING COUNT(*) > 5;

-- CTE
WITH active_users AS (
    SELECT * FROM users WHERE active = 1
)
SELECT * FROM active_users;

-- Subquery
SELECT *
FROM orders
WHERE customer_id IN (SELECT id FROM customers WHERE vip = 1);

-- Window function
SELECT
    id,
    name,
    ROW_NUMBER() OVER (ORDER BY id) as row_num
FROM users;
