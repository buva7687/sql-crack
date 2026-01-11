-- Test SQL Queries for SQL Crack Visualization
-- This file contains multiple queries to test batch processing

-- Query 1: Simple SELECT with JOIN
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
    AND u.created_at > '2024-01-01'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 100;

-- Query 2: CTE with Window Function
WITH ranked_products AS (
    SELECT
        p.id,
        p.name,
        p.category_id,
        p.price,
        ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.price DESC) as price_rank
    FROM products p
    WHERE p.active = 1
)
SELECT *
FROM ranked_products
WHERE price_rank <= 5;

-- Query 3: Complex multi-join query
SELECT
    c.name as customer_name,
    o.order_date,
    p.name as product_name,
    oi.quantity,
    oi.unit_price,
    (oi.quantity * oi.unit_price) as line_total
FROM customers c
INNER JOIN orders o ON c.id = o.customer_id
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
LEFT JOIN categories cat ON p.category_id = cat.id
WHERE o.status = 'completed'
    AND o.order_date >= '2024-01-01'
ORDER BY o.order_date DESC, c.name;

-- Query 4: UNION example
SELECT id, name, 'customer' as type FROM customers WHERE active = 1
UNION ALL
SELECT id, name, 'supplier' as type FROM suppliers WHERE active = 1;

-- Query 5: Subquery example
SELECT *
FROM products
WHERE category_id IN (
    SELECT id
    FROM categories
    WHERE parent_id IS NULL
)
ORDER BY name;

-- Query 6: DELETE without WHERE (should trigger warning)
DELETE FROM temp_logs;

-- Query 7: SELECT * (should trigger warning)
SELECT * FROM users WHERE id = 1;
