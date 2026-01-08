-- Example SQL queries to test SQL Crack visualization

-- Simple SELECT query
SELECT id, name, email, created_at
FROM users
WHERE active = 1
ORDER BY created_at DESC
LIMIT 10;

-- Complex JOIN query
SELECT
    u.id,
    u.name,
    u.email,
    o.order_id,
    o.total_amount,
    o.status,
    p.product_name,
    od.quantity,
    od.price
FROM users u
INNER JOIN orders o ON u.id = o.user_id
LEFT JOIN order_details od ON o.order_id = od.order_id
INNER JOIN products p ON od.product_id = p.id
WHERE o.status = 'completed'
    AND o.created_at >= '2024-01-01'
    AND u.active = 1
GROUP BY u.id, o.order_id, p.product_name
ORDER BY o.created_at DESC
LIMIT 50;

-- UPDATE query
UPDATE users
SET last_login = NOW(), login_count = login_count + 1
WHERE id = 123;

-- DELETE query
DELETE FROM sessions
WHERE expires_at < NOW();

-- INSERT query
INSERT INTO users (name, email, created_at)
VALUES ('John Doe', 'john@example.com', NOW());
